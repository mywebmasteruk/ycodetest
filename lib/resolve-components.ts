/**
 * Server-side utility to resolve component instances in layer tree
 * Replaces layers with componentId with the actual component layers
 * Applies component variable overrides during resolution
 */

import type { Layer, Component, ComponentVariable } from '@/types';

/**
 * Transform layer IDs to be instance-specific to ensure unique IDs per component instance.
 * This enables animations to target the correct elements when multiple instances exist.
 * @param layers - Layers to transform
 * @param instanceLayerId - The component instance's layer ID used as namespace
 * @returns Transformed layers with remapped IDs and interaction references
 */
function transformLayerIdsForInstance(layers: Layer[], instanceLayerId: string): Layer[] {
  // Build ID map: original ID -> instance-specific ID
  const idMap = new Map<string, string>();
  
  // First pass: collect all layer IDs and generate new ones
  const collectIds = (layerList: Layer[]) => {
    for (const layer of layerList) {
      const newId = `${instanceLayerId}_${layer.id}`;
      idMap.set(layer.id, newId);
      if (layer.children) {
        collectIds(layer.children);
      }
    }
  };
  collectIds(layers);
  
  // Second pass: transform layers with new IDs and remapped interactions
  const transformLayer = (layer: Layer): Layer => {
    const newId = idMap.get(layer.id) || layer.id;
    
    const transformedLayer: Layer = {
      ...layer,
      id: newId,
    };
    
    // Remap interaction IDs and tween layer_id references
    // Interaction IDs must be unique per instance to prevent timeline caching issues
    if (layer.interactions && layer.interactions.length > 0) {
      transformedLayer.interactions = layer.interactions.map(interaction => ({
        ...interaction,
        id: `${instanceLayerId}_${interaction.id}`,
        tweens: interaction.tweens.map(tween => ({
          ...tween,
          layer_id: idMap.get(tween.layer_id) || tween.layer_id,
        })),
      }));
    }
    
    // Recursively transform children
    if (layer.children) {
      transformedLayer.children = layer.children.map(transformLayer);
    }
    
    return transformedLayer;
  };
  
  return layers.map(transformLayer);
}

/**
 * Apply component variable overrides (or defaults) to layers
 * Recursively finds layers with linked variables and applies override or default values
 */
function applyComponentOverrides(
  layers: Layer[],
  overrides?: Layer['componentOverrides'],
  componentVariables?: ComponentVariable[]
): Layer[] {
  return layers.map(layer => {
    let updatedLayer = { ...layer };

    // Check if this layer has a text variable linked
    const linkedTextVariableId = layer.variables?.text?.id;
    if (linkedTextVariableId) {
      // Check for override first, then fall back to variable's default value
      const overrideValue = overrides?.text?.[linkedTextVariableId];
      const variableDef = componentVariables?.find(v => v.id === linkedTextVariableId);
      const valueToApply = overrideValue ?? variableDef?.default_value;
      
      // Only apply if it's a text variable (has 'type' property, not ImageSettingsValue)
      if (valueToApply && 'type' in valueToApply) {
        // Apply the value to this layer's text variable
        updatedLayer = {
          ...updatedLayer,
          variables: {
            ...updatedLayer.variables,
            text: valueToApply as any,
          },
        };
      }
    }

    // Check if this layer has an image variable linked
    const linkedImageVariableId = (layer.variables?.image?.src as any)?.id;
    if (linkedImageVariableId) {
      // Check for override first, then fall back to variable's default value
      const overrideValue = overrides?.image?.[linkedImageVariableId];
      const variableDef = componentVariables?.find(v => v.id === linkedImageVariableId);
      const imageValue = (overrideValue ?? variableDef?.default_value) as any;
      
      if (imageValue) {
        // Apply the value to this layer's image variable
        updatedLayer = {
          ...updatedLayer,
          variables: {
            ...updatedLayer.variables,
            image: {
              ...updatedLayer.variables?.image,
              // Apply src from value, keeping the variable ID for reference
              src: imageValue.src ? { ...imageValue.src, id: linkedImageVariableId } : updatedLayer.variables?.image?.src,
              // Apply alt from value if present
              alt: imageValue.alt ?? updatedLayer.variables?.image?.alt,
            },
          },
          // Apply width/height attributes from value if present
          attributes: {
            ...updatedLayer.attributes,
            ...(imageValue.width && { width: imageValue.width }),
            ...(imageValue.height && { height: imageValue.height }),
            ...(imageValue.loading && { loading: imageValue.loading }),
          },
        };
      }
    }

    // Check if this layer has a link variable linked
    const linkedLinkVariableId = (layer.variables?.link as any)?.variable_id;
    if (linkedLinkVariableId) {
      // Check for override first, then fall back to variable's default value
      const overrideValue = overrides?.link?.[linkedLinkVariableId];
      const variableDef = componentVariables?.find(v => v.id === linkedLinkVariableId);
      const linkValue = (overrideValue ?? variableDef?.default_value) as any;

      if (linkValue) {
        // Apply the value to this layer's link variable, keeping the variable_id for reference
        updatedLayer = {
          ...updatedLayer,
          variables: {
            ...updatedLayer.variables,
            link: { ...linkValue, variable_id: linkedLinkVariableId },
          },
        };
      }
    }

    // Check if this layer has an audio variable linked
    const linkedAudioVariableId = (layer.variables?.audio?.src as any)?.id;
    if (linkedAudioVariableId) {
      const overrideValue = overrides?.audio?.[linkedAudioVariableId];
      const variableDef = componentVariables?.find(v => v.id === linkedAudioVariableId);
      const audioValue = (overrideValue ?? variableDef?.default_value) as any;

      if (audioValue) {
        const audioAttributes: Record<string, unknown> = {};
        if (audioValue.controls !== undefined) audioAttributes.controls = audioValue.controls;
        if (audioValue.loop !== undefined) audioAttributes.loop = audioValue.loop;
        if (audioValue.muted !== undefined) audioAttributes.muted = audioValue.muted;
        if (audioValue.volume !== undefined) audioAttributes.volume = String(audioValue.volume);

        updatedLayer = {
          ...updatedLayer,
          variables: {
            ...updatedLayer.variables,
            audio: {
              ...updatedLayer.variables?.audio,
              src: audioValue.src ? { ...audioValue.src, id: linkedAudioVariableId } : updatedLayer.variables?.audio?.src,
            },
          },
          ...(Object.keys(audioAttributes).length > 0 && {
            attributes: { ...updatedLayer.attributes, ...audioAttributes },
          }),
        };
      }
    }

    // Check if this layer has a video variable linked
    const linkedVideoVariableId = (layer.variables?.video?.src as any)?.id;
    if (linkedVideoVariableId) {
      const overrideValue = overrides?.video?.[linkedVideoVariableId];
      const variableDef = componentVariables?.find(v => v.id === linkedVideoVariableId);
      const videoValue = (overrideValue ?? variableDef?.default_value) as any;

      if (videoValue) {
        const videoAttributes: Record<string, unknown> = {};
        if (videoValue.controls !== undefined) videoAttributes.controls = videoValue.controls;
        if (videoValue.loop !== undefined) videoAttributes.loop = videoValue.loop;
        if (videoValue.muted !== undefined) videoAttributes.muted = videoValue.muted;
        if (videoValue.autoplay !== undefined) videoAttributes.autoplay = videoValue.autoplay;
        if (videoValue.youtubePrivacyMode !== undefined) videoAttributes.youtubePrivacyMode = videoValue.youtubePrivacyMode;

        updatedLayer = {
          ...updatedLayer,
          variables: {
            ...updatedLayer.variables,
            video: {
              ...updatedLayer.variables?.video,
              src: videoValue.src ? { ...videoValue.src, id: linkedVideoVariableId } : updatedLayer.variables?.video?.src,
              poster: videoValue.poster ?? updatedLayer.variables?.video?.poster,
            },
          },
          ...(Object.keys(videoAttributes).length > 0 && {
            attributes: { ...updatedLayer.attributes, ...videoAttributes },
          }),
        };
      }
    }

    // Check if this layer has an icon variable linked
    const linkedIconVariableId = (layer.variables?.icon?.src as any)?.id;
    if (linkedIconVariableId) {
      const overrideValue = overrides?.icon?.[linkedIconVariableId];
      const variableDef = componentVariables?.find(v => v.id === linkedIconVariableId);
      const iconValue = (overrideValue ?? variableDef?.default_value) as any;

      if (iconValue) {
        updatedLayer = {
          ...updatedLayer,
          variables: {
            ...updatedLayer.variables,
            icon: {
              ...updatedLayer.variables?.icon,
              src: iconValue.src ? { ...iconValue.src, id: linkedIconVariableId } : updatedLayer.variables?.icon?.src,
            },
          },
        };
      }
    }

    // Recursively process children
    if (updatedLayer.children) {
      updatedLayer.children = applyComponentOverrides(updatedLayer.children, overrides, componentVariables);
    }

    return updatedLayer;
  });
}

/**
 * Tag layers with their master component ID for translation lookups
 */
function tagLayersWithComponentId(layers: Layer[], componentId: string): Layer[] {
  return layers.map(layer => ({
    ...layer,
    _masterComponentId: componentId,
    children: layer.children
      ? tagLayersWithComponentId(layer.children, componentId)
      : undefined,
  }));
}

/**
 * Recursively resolve component instances in a layer tree
 * @param layers - The layer tree to process
 * @param components - Array of available components
 * @returns Layer tree with components resolved
 */
export function resolveComponents(layers: Layer[], components: Component[]): Layer[] {
  return layers.map(layer => {
    // If this layer is a component instance, populate its children from the component
    if (layer.componentId) {
      const component = components.find(c => c.id === layer.componentId);

      if (component?.layers?.length) {
        // The component's first layer is the actual content (Section, etc.)
        const componentContent = component.layers[0];

        // Recursively resolve nested components
        const nestedResolved = componentContent.children
          ? resolveComponents(componentContent.children, components)
          : [];

        // Apply component variable overrides (or defaults) before tagging
        const overriddenChildren = applyComponentOverrides(
          nestedResolved,
          layer.componentOverrides,
          component.variables
        );

        // Also apply overrides to the root layer itself (for root-level link/text/image variables)
        // Process without children since they're already handled above
        const [overriddenRoot] = applyComponentOverrides(
          [{ ...componentContent, children: undefined }],
          layer.componentOverrides,
          component.variables
        );

        // Tag with master component ID for translation lookups
        const taggedChildren = overriddenChildren.length
          ? tagLayersWithComponentId(overriddenChildren, component.id)
          : [];

        // Transform layer IDs to be instance-specific
        // This ensures each component instance has unique IDs for proper animation targeting
        const resolvedChildren = taggedChildren.length
          ? transformLayerIdsForInstance(taggedChildren, layer.id)
          : [];

        // Merge component content with instance layer, keeping instance ID
        // IMPORTANT: Keep componentId so LayerRenderer knows this is a component instance
        return {
          ...layer,
          ...overriddenRoot,
          id: layer.id,
          componentId: layer.componentId, // Keep the original componentId
          _masterComponentId: component.id,
          children: resolvedChildren,
        };
      }

      console.warn('[resolveComponents] Component not found or has no layers:', layer.componentId);
    }

    // Recursively process children for non-component layers
    if (layer.children?.length) {
      return {
        ...layer,
        children: resolveComponents(layer.children, components),
      };
    }

    return layer;
  });
}
