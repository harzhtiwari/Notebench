import React from "react";
import type { SettingDefinition } from "@notebook/contracts";
import { VersionBadge } from "./VersionBadge";

interface SettingRowProps {
  setting: SettingDefinition;
  value: unknown;
  onChange: (nextValue: unknown) => void;
  onActionClick?: (settingId: string) => void;
}

const CUSTOM_SETTING_RENDERERS: Record<string, React.ReactNode> = {
  "privacy.zeroTelemetry": (
    <span className="text-emerald-400 font-mono text-[11px]">
      🛡️ Zero telemetry enforced
    </span>
  ),
  "privacy.dntStatus": (
    <span className="text-emerald-400 font-mono text-[11px]">
      GPC & DNT Active
    </span>
  ),
  "health.doctorReport": (
    <span className="text-zinc-300 font-mono text-[11px]">
      Daemon status: Normal (v0.1.0, WAL)
    </span>
  ),
  "storage.usageBreakdown": (
    <span className="text-zinc-300 font-mono text-[11px]">
      DB: 4.2 MB | Vectors: 1.8 MB
    </span>
  ),
  "memory.viewLearned": (
    <span className="text-zinc-400 italic text-[11px]">
      No learned briefing facts
    </span>
  ),
};

export const SettingRow: React.FC<SettingRowProps> = ({
  setting,
  value,
  onChange,
  onActionClick,
}) => {
  const isDisabled = setting.status.state === "disabled";
  const descId = `desc-${setting.id}`;

  return (
    <div
      data-testid={`setting-row-${setting.id}`}
      className={`py-3.5 border-b border-zinc-800/60 last:border-b-0 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        isDisabled ? "opacity-60" : ""
      }`}
    >
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <label htmlFor={setting.id} className="text-xs font-semibold text-zinc-100">
            {setting.label}
          </label>
          {isDisabled && <VersionBadge milestone={setting.status.until} />}
        </div>
        {setting.description && (
          <p id={descId} className="text-[11px] text-zinc-400">
            {setting.description}
          </p>
        )}
        {isDisabled && (
          <p
            className="text-[11px] text-amber-400/90 italic"
            data-testid={`disabled-reason-${setting.id}`}
          >
            ℹ️ {setting.status.reason}
          </p>
        )}
      </div>

      <div className="flex items-center">
        {setting.control === "toggle" && (
          <input
            id={setting.id}
            data-testid={`control-${setting.id}`}
            type="checkbox"
            checked={Boolean(value ?? setting.defaultValue)}
            disabled={isDisabled}
            aria-disabled={isDisabled}
            aria-describedby={descId}
            onChange={(e) => {
              if (!isDisabled) onChange(e.target.checked);
            }}
            className="h-4 w-4 rounded bg-zinc-900 border-zinc-700 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed cursor-pointer"
          />
        )}

        {setting.control === "input" && (
          <input
            id={setting.id}
            data-testid={`control-${setting.id}`}
            type={setting.inputType ?? "text"}
            value={String(value ?? setting.defaultValue ?? "")}
            disabled={isDisabled}
            aria-disabled={isDisabled}
            aria-describedby={descId}
            placeholder={setting.placeholder}
            onChange={(e) => {
              if (!isDisabled) onChange(e.target.value);
            }}
            className="w-full md:w-64 px-2.5 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed"
          />
        )}

        {setting.control === "select" && (
          <select
            id={setting.id}
            data-testid={`control-${setting.id}`}
            value={String(value ?? setting.defaultValue)}
            disabled={isDisabled}
            aria-disabled={isDisabled}
            aria-describedby={descId}
            onChange={(e) => {
              if (!isDisabled) onChange(e.target.value);
            }}
            className="w-full md:w-64 px-2.5 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed cursor-pointer"
          >
            {setting.options?.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label} {opt.until ? `(Coming in ${opt.until})` : ""}
              </option>
            ))}
          </select>
        )}

        {setting.control === "button" && (
          <button
            id={setting.id}
            data-testid={`control-${setting.id}`}
            type="button"
            disabled={isDisabled}
            aria-disabled={isDisabled}
            aria-describedby={descId}
            onClick={() => {
              if (!isDisabled && onActionClick) onActionClick(setting.id);
            }}
            className={`px-3 py-1 text-xs font-medium rounded focus:outline-none disabled:cursor-not-allowed transition-colors ${
              setting.isDestructive
                ? "bg-red-600 hover:bg-red-700 text-white disabled:bg-red-950 disabled:text-red-400"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:bg-zinc-900 disabled:text-zinc-600"
            }`}
          >
            {setting.buttonText ?? "Execute"}
          </button>
        )}

        {setting.control === "custom" && (
          <div
            id={setting.id}
            data-testid={`control-${setting.id}`}
            aria-disabled={isDisabled}
            className="text-xs text-zinc-400 bg-zinc-900/80 px-3 py-1.5 rounded border border-zinc-800"
          >
            {isDisabled ? (
              <span className="text-zinc-500 italic">Custom module inactive</span>
            ) : (
              CUSTOM_SETTING_RENDERERS[setting.id] ?? (
                <span className="italic text-[11px]">Active inspection view</span>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};
