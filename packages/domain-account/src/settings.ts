import {
  SETTINGS_REGISTRY,
  type SettingDefinition,
  NotFoundError,
  ValidationError,
} from "@notebook/contracts";

const registryMap = new Map<string, SettingDefinition>(
  SETTINGS_REGISTRY.map((s) => [s.id, s])
);

/**
 * Retrieves a setting definition by its unique identifier.
 */
export function getSettingDefinition(id: string): SettingDefinition | undefined {
  return registryMap.get(id);
}

/**
 * Validates an incoming setting value against the canonical declarative registry.
 * Enforces perimeter defense: mutations targeting disabled settings are strictly rejected.
 */
export function validateSettingUpdate(settingId: string, value: unknown): unknown {
  const definition = registryMap.get(settingId);
  if (!definition) {
    throw new NotFoundError(`Setting '${settingId}' does not exist in registry.`);
  }

  // 🛡️ Perimeter Guard: Refuse mutations on disabled settings
  if (definition.status.state === "disabled") {
    throw new ValidationError(
      `Cannot modify setting '${settingId}': It is disabled until version ${definition.status.until} (${definition.status.reason})`,
      { settingId, status: definition.status }
    );
  }

  // Validate value against definition schema
  const parseResult = definition.valueSchema.safeParse(value);
  if (!parseResult.success) {
    throw new ValidationError(`Validation failed for setting '${settingId}'`, {
      settingId,
      issues: parseResult.error.issues,
    });
  }

  return parseResult.data;
}

/**
 * Resolves effective settings by merging stored values with default values from the registry.
 */
export function resolveEffectiveSettings(
  storedValues: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const setting of SETTINGS_REGISTRY) {
    if (Object.prototype.hasOwnProperty.call(storedValues, setting.id)) {
      result[setting.id] = storedValues[setting.id];
    } else {
      result[setting.id] = setting.defaultValue;
    }
  }

  return result;
}
