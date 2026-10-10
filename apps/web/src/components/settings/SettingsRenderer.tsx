import React from "react";
import type { SettingsPageId } from "@notebook/contracts";
import { getSettingsForPage, getSectionsForPage } from "@notebook/contracts";
import { SettingRow } from "./SettingRow";

interface SettingsRendererProps {
  page: SettingsPageId;
  values: Record<string, unknown>;
  onChange: (settingId: string, nextValue: unknown) => void;
  onActionClick?: (settingId: string) => void;
}

export const SettingsRenderer: React.FC<SettingsRendererProps> = ({
  page,
  values,
  onChange,
  onActionClick,
}) => {
  const sections = getSectionsForPage(page);
  const settings = getSettingsForPage(page);

  return (
    <div className="space-y-6" data-testid={`settings-page-${page}`}>
      {sections.map((section) => {
        const sectionSettings = settings.filter((s) => s.section === section.id);
        if (sectionSettings.length === 0) return null;

        return (
          <section
            key={section.id}
            className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-5 space-y-3"
          >
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">{section.title}</h3>
              {section.description && (
                <p className="text-[11px] text-zinc-400 mt-0.5">{section.description}</p>
              )}
            </div>

            <div className="divide-y divide-zinc-800/50">
              {sectionSettings.map((setting) => (
                <SettingRow
                  key={setting.id}
                  setting={setting}
                  value={values[setting.id]}
                  onChange={(val) => onChange(setting.id, val)}
                  onActionClick={(id) => onActionClick?.(id)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};
