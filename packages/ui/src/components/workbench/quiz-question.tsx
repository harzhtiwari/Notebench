import * as React from "react";
import type { QuizOption, QuizQuestion as QuizQuestionData } from "@notebook/contracts";
import { Button } from "../primitives/button.js";
import {
  CheckCircle,
  XCircle,
  PencilSimple,
  Plus,
  Trash,
} from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export interface QuizQuestionProps extends React.HTMLAttributes<HTMLDivElement> {
  question: QuizQuestionData;
  selectedOptionId?: string | undefined;
  onSelectOption?: ((optionId: string) => void) | undefined;
  onCheckAnswer?: (() => void) | undefined;
  isChecked?: boolean | undefined;
  scoreLabel?: string | undefined;
  isEditing?: boolean | undefined;
  onEditToggle?: (() => void) | undefined;
  onSave?:
    | ((updated: {
        prompt: string;
        options: QuizOption[];
        correctOptionId: string;
        explanation: string;
      }) => void)
    | undefined;
}

/**
 * Quiz Question Component (ticket 15, Decision 4.9).
 * Supports WAI-ARIA compliant runner mode with instant feedback, explanation,
 * score indicator, and assessment builder editing mode.
 */
export const QuizQuestion = React.forwardRef<HTMLDivElement, QuizQuestionProps>(
  (
    {
      className,
      question,
      selectedOptionId,
      onSelectOption,
      onCheckAnswer,
      isChecked = false,
      scoreLabel,
      isEditing = false,
      onEditToggle,
      onSave,
      ...props
    },
    ref
  ) => {
    const [editPrompt, setEditPrompt] = React.useState(question.prompt);
    const [editOptions, setEditOptions] = React.useState<QuizOption[]>(question.options);
    const [editCorrectId, setEditCorrectId] = React.useState(question.correctOptionId);
    const [editExplanation, setEditExplanation] = React.useState(question.explanation);

    React.useEffect(() => {
      setEditPrompt(question.prompt);
      setEditOptions(question.options);
      setEditCorrectId(question.correctOptionId);
      setEditExplanation(question.explanation);
    }, [question]);

    const isCorrect = isChecked && selectedOptionId === question.correctOptionId;

    const handleOptionTextChange = (id: string, text: string) => {
      setEditOptions((prev) =>
        prev.map((opt) => (opt.id === id ? { ...opt, text } : opt))
      );
    };

    const handleAddOption = () => {
      if (editOptions.length >= 6) return;
      const newId = crypto.randomUUID();
      setEditOptions((prev) => [...prev, { id: newId, text: "" }]);
    };

    const handleRemoveOption = (id: string) => {
      if (editOptions.length <= 2) return;
      const next = editOptions.filter((opt) => opt.id !== id);
      setEditOptions(next);
      if (editCorrectId === id && next[0]) {
        setEditCorrectId(next[0].id);
      }
    };

    const handleSave = () => {
      onSave?.({
        prompt: editPrompt,
        options: editOptions,
        correctOptionId: editCorrectId,
        explanation: editExplanation,
      });
    };

    if (isEditing) {
      return (
        <div
          ref={ref}
          role="region"
          aria-label="Edit quiz question"
          className={cn(
            "grid gap-[var(--nb-space-4)] rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-4)] text-[var(--nb-ink)]",
            className
          )}
          {...props}
        >
          <div className="flex items-center justify-between border-b border-[var(--nb-hairline)] pb-[var(--nb-space-2)]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--nb-ink-3)]">
              Edit Question
            </span>
            {onEditToggle !== undefined ? (
              <Button variant="ghost" size="sm" onClick={onEditToggle}>
                Cancel
              </Button>
            ) : null}
          </div>

          <div className="grid gap-[var(--nb-space-2)]">
            <label
              htmlFor={`quiz-prompt-${question.id}`}
              className="text-xs font-medium text-[var(--nb-ink-2)]"
            >
              Question prompt
            </label>
            <textarea
              id={`quiz-prompt-${question.id}`}
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-[var(--nb-radius-well)] border border-[var(--nb-hairline)] bg-[var(--nb-well)] p-[var(--nb-space-2)] font-[var(--nb-font-ui)] text-sm text-[var(--nb-ink)] focus:outline-none focus:ring-[var(--nb-ring-width)] focus:ring-[var(--nb-focus)]"
            />
          </div>

          <div className="grid gap-[var(--nb-space-2)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--nb-ink-2)]">
                Options (select radio for correct answer)
              </span>
              {editOptions.length < 6 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddOption}
                  className="h-[var(--nb-size-control-sm)] gap-[var(--nb-space-1)] text-xs"
                >
                  <Plus size={14} aria-hidden="true" />
                  Add option
                </Button>
              ) : null}
            </div>

            <div className="grid gap-[var(--nb-space-2)]">
              {editOptions.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-[var(--nb-space-2)]">
                  <input
                    type="radio"
                    name={`correct-option-${question.id}`}
                    checked={editCorrectId === opt.id}
                    onChange={() => setEditCorrectId(opt.id)}
                    aria-label={`Mark option ${idx + 1} as correct`}
                    className="h-[var(--nb-size-icon-sm)] w-[var(--nb-size-icon-sm)] cursor-pointer accent-[var(--nb-ok)]"
                  />
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => handleOptionTextChange(opt.id, e.target.value)}
                    aria-label={`Option ${idx + 1} text`}
                    className="flex-1 rounded-[var(--nb-radius-well)] border border-[var(--nb-hairline)] bg-[var(--nb-well)] px-[var(--nb-space-2)] py-[var(--nb-space-1)] text-sm text-[var(--nb-ink)] focus:outline-none focus:ring-[var(--nb-ring-width)] focus:ring-[var(--nb-focus)]"
                  />
                  {editOptions.length > 2 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveOption(opt.id)}
                      aria-label={`Remove option ${idx + 1}`}
                      className="h-[var(--nb-size-control-sm)] w-[var(--nb-size-control-sm)] p-0 text-[var(--nb-danger)] hover:bg-[var(--nb-danger-wash)]"
                    >
                      <Trash size={14} aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-[var(--nb-space-2)]">
            <label
              htmlFor={`quiz-explanation-${question.id}`}
              className="text-xs font-medium text-[var(--nb-ink-2)]"
            >
              Explanation
            </label>
            <textarea
              id={`quiz-explanation-${question.id}`}
              value={editExplanation}
              onChange={(e) => setEditExplanation(e.target.value)}
              rows={2}
              className="w-full rounded-[var(--nb-radius-well)] border border-[var(--nb-hairline)] bg-[var(--nb-well)] p-[var(--nb-space-2)] font-[var(--nb-font-ui)] text-sm text-[var(--nb-ink)] focus:outline-none focus:ring-[var(--nb-ring-width)] focus:ring-[var(--nb-focus)]"
            />
          </div>

          <div className="flex items-center justify-end gap-[var(--nb-space-2)] pt-[var(--nb-space-2)]">
            <Button variant="default" size="sm" onClick={handleSave}>
              Save question
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        role="region"
        aria-label="Quiz question"
        className={cn(
          "grid gap-[var(--nb-space-4)] rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-4)] text-[var(--nb-ink)]",
          className
        )}
        {...props}
      >
        {/* Header: Prompt and Edit Affordance */}
        <div className="flex items-start justify-between gap-[var(--nb-space-2)]">
          <h3 className="font-[var(--nb-font-ui)] text-[var(--nb-text-md)] font-semibold leading-[var(--nb-leading-ui)] text-[var(--nb-ink)]">
            {question.prompt}
          </h3>
          {onEditToggle !== undefined ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onEditToggle}
              aria-label="Edit question"
              className="h-[var(--nb-size-control-sm)] w-[var(--nb-size-control-sm)] p-0"
            >
              <PencilSimple size={14} aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        {/* Options List */}
        <div
          role="radiogroup"
          aria-label="Answer options"
          className="grid gap-[var(--nb-space-2)]"
        >
          {question.options.map((opt) => {
            const isSelected = selectedOptionId === opt.id;
            const isCorrectOption = opt.id === question.correctOptionId;

            let optionStyle =
              "border-[var(--nb-hairline)] bg-[var(--nb-sheet)] hover:bg-[var(--nb-well)]";
            let StatusIcon: typeof CheckCircle | null = null;

            if (isChecked) {
              if (isCorrectOption) {
                optionStyle =
                  "border-[var(--nb-ok)] bg-[var(--nb-ok-wash)] text-[var(--nb-ok)]";
                StatusIcon = CheckCircle;
              } else if (isSelected && !isCorrectOption) {
                optionStyle =
                  "border-[var(--nb-danger)] bg-[var(--nb-danger-wash)] text-[var(--nb-danger)]";
                StatusIcon = XCircle;
              } else {
                optionStyle = "border-[var(--nb-hairline)] opacity-60";
              }
            } else if (isSelected) {
              optionStyle =
                "border-[var(--nb-focus)] bg-[var(--nb-select)] text-[var(--nb-ink)]";
            }

            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={isChecked}
                onClick={() => onSelectOption?.(opt.id)}
                className={cn(
                  "flex items-center justify-between rounded-[var(--nb-radius-well)] border p-[var(--nb-space-3)] text-left text-sm font-medium transition-colors duration-[var(--nb-dur-fast)] focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)]",
                  optionStyle
                )}
              >
                <span>{opt.text}</span>
                {StatusIcon !== null ? (
                  <StatusIcon size={16} weight="fill" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Action / Result Feedback */}
        <div className="flex flex-wrap items-center justify-between gap-[var(--nb-space-2)] pt-[var(--nb-space-2)]">
          {!isChecked ? (
            <Button
              variant="default"
              size="sm"
              disabled={selectedOptionId === undefined}
              onClick={onCheckAnswer}
            >
              Check answer
            </Button>
          ) : (
            <div className="flex items-center gap-[var(--nb-space-2)]">
              {isCorrect ? (
                <span className="inline-flex items-center gap-[var(--nb-space-1)] rounded-[var(--nb-radius-chip)] bg-[var(--nb-ok-wash)] px-[var(--nb-space-2)] py-[var(--nb-space-0-5)] text-xs font-semibold text-[var(--nb-ok)]">
                  <CheckCircle size={14} weight="fill" aria-hidden="true" />
                  Correct!
                </span>
              ) : (
                <span className="inline-flex items-center gap-[var(--nb-space-1)] rounded-[var(--nb-radius-chip)] bg-[var(--nb-danger-wash)] px-[var(--nb-space-2)] py-[var(--nb-space-0-5)] text-xs font-semibold text-[var(--nb-danger)]">
                  <XCircle size={14} weight="fill" aria-hidden="true" />
                  Incorrect
                </span>
              )}
              {scoreLabel !== undefined ? (
                <span className="text-xs font-semibold text-[var(--nb-ink-2)]">
                  Score: {scoreLabel}
                </span>
              ) : null}
            </div>
          )}
        </div>

        {/* Explanation well after check */}
        {isChecked && question.explanation ? (
          <div className="rounded-[var(--nb-radius-well)] border border-[var(--nb-hairline)] bg-[var(--nb-well)] p-[var(--nb-space-3)] text-xs text-[var(--nb-ink-2)]">
            <span className="font-semibold text-[var(--nb-ink)]">Explanation: </span>
            {question.explanation}
          </div>
        ) : null}
      </div>
    );
  }
);

QuizQuestion.displayName = "QuizQuestion";
