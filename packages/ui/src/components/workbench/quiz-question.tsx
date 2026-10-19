import * as React from "react";
import type { QuizOption, QuizQuestion as QuizQuestionData } from "@notebench/contracts";
import {
  Badge,
  Button,
  Card,
  FormField,
  IconButton,
  Input,
  Textarea,
  Well,
} from "../primitives/index.js";
import {
  CheckCircleIcon,
  XCircleIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export interface QuizQuestionDraft {
  prompt: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
}

export interface QuizQuestionProps extends React.HTMLAttributes<HTMLDivElement> {
  question: QuizQuestionData;
  selectedOptionId?: string | undefined;
  onSelectOption?: ((optionId: string) => void) | undefined;
  onCheckAnswer?: (() => void) | undefined;
  isChecked?: boolean | undefined;
  scoreLabel?: string | undefined;
  isEditing?: boolean | undefined;
  onEditToggle?: (() => void) | undefined;
  onSave?: ((updated: QuizQuestionDraft) => void) | undefined;
}

/**
Quiz Question Component (ticket 15, Decision 4.9).
Supports WAI-ARIA compliant runner mode with instant feedback, explanation,
score indicator, and assessment builder editing mode.
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
        <Card
          ref={ref}
          role="region"
          aria-label="Edit quiz question"
          className={cn("grid gap-[var(--nb-space-4)]", className)}
          {...props}
        >
          <div className="flex items-center justify-between border-b border-[var(--nb-hairline)] pb-[var(--nb-space-2)]">
            <span className="text-xs font-semibold text-[var(--nb-ink-3)]">
              Edit Question
            </span>
            {onEditToggle === undefined ? null : (
              <Button variant="nb_btn_ghost" size="nb_btn_sm" onClick={onEditToggle}>
                Cancel
              </Button>
            )}
          </div>

          <FormField label="Question prompt">
            <Textarea
              id={`quiz-prompt-${question.id}`}
              value={editPrompt}
              onChange={(e) => { setEditPrompt(e.target.value); }}
              rows={3}
            />
          </FormField>

          <div className="grid gap-[var(--nb-space-2)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--nb-ink-2)]">
                Options (select radio for correct answer)
              </span>
              {editOptions.length < 6 ? (
                <Button
                  variant="nb_btn_ghost"
                  size="nb_btn_sm"
                  onClick={handleAddOption}
                  leadingIcon={PlusIcon}
                >
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
                    onChange={() => { setEditCorrectId(opt.id); }}
                    aria-label={`Mark option ${idx + 1} as correct`}
                    className="m-0 h-[var(--nb-size-icon-lg)] w-[var(--nb-size-icon-lg)] shrink-0 cursor-pointer accent-[var(--nb-ink)]"
                  />
                  <Input
                    type="text"
                    value={opt.text}
                    onChange={(e) => { handleOptionTextChange(opt.id, e.target.value); }}
                    aria-label={`Option ${idx + 1} text`}
                    className="flex-1"
                  />
                  {editOptions.length > 2 ? (
                    <IconButton
                      variant="nb_btn_ghost"
                      size="nb_btn_icon_sm"
                      icon={TrashIcon}
                      onClick={() => { handleRemoveOption(opt.id); }}
                      aria-label={`Remove option ${idx + 1}`}
                      className="text-[var(--nb-danger)] hover:bg-[var(--nb-danger-wash)]"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <FormField label="Explanation">
            <Textarea
              id={`quiz-explanation-${question.id}`}
              value={editExplanation}
              onChange={(e) => { setEditExplanation(e.target.value); }}
              rows={2}
            />
          </FormField>

          <div className="flex items-center justify-end gap-[var(--nb-space-2)] pt-[var(--nb-space-2)]">
            <Button variant="nb_btn_primary" size="nb_btn_sm" onClick={handleSave}>
              Save question
            </Button>
          </div>
        </Card>
      );
    }

    return (
      <Card
        ref={ref}
        role="region"
        aria-label="Quiz question"
        className={cn("grid gap-[var(--nb-space-4)]", className)}
        {...props}
      >
        {/* Header: Prompt and Edit Affordance */}
        <div className="flex items-start justify-between gap-[var(--nb-space-2)]">
          <h3 className="font-[family-name:var(--nb-font-ui)] text-[length:var(--nb-text-md)] font-semibold leading-[var(--nb-leading-ui)] text-[var(--nb-ink)]">
            {question.prompt}
          </h3>
          {onEditToggle === undefined ? null : (
            <IconButton
              variant="nb_btn_ghost"
              size="nb_btn_icon_sm"
              icon={PencilSimpleIcon}
              onClick={onEditToggle}
              aria-label="Edit question"
            />
          )}
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
            let StatusIcon: typeof CheckCircleIcon | null = null;

            if (isChecked) {
              if (isCorrectOption) {
                optionStyle =
                  "border-[var(--nb-ok)] bg-[var(--nb-ok-wash)] text-[var(--nb-ok)]";
                StatusIcon = CheckCircleIcon;
              } else if (isSelected) {
                optionStyle =
                  "border-[var(--nb-danger)] bg-[var(--nb-danger-wash)] text-[var(--nb-danger)]";
                StatusIcon = XCircleIcon;
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
                  "flex items-center justify-between rounded-[var(--nb-radius-well)] border p-[var(--nb-space-3)] text-left text-sm font-medium transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none focus-visible:outline-solid focus-visible:outline-[length:var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)]",
                  optionStyle
                )}
              >
                <span>{opt.text}</span>
                {StatusIcon === null ? null : (
                  <StatusIcon size={16} weight="fill" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        {/* Action / Result Feedback */}
        <div className="flex flex-wrap items-center justify-between gap-[var(--nb-space-2)] pt-[var(--nb-space-2)]">
          {isChecked ? (
            <div className="flex items-center gap-[var(--nb-space-2)]">
              {isCorrect ? (
                <Badge variant="ok" icon={<CheckCircleIcon size={16} weight="fill" aria-hidden="true" />}>
                  Correct!
                </Badge>
              ) : (
                <Badge variant="danger" icon={<XCircleIcon size={16} weight="fill" aria-hidden="true" />}>
                  Incorrect
                </Badge>
              )}
              {scoreLabel === undefined ? null : (
                <span className="text-xs font-semibold text-[var(--nb-ink-2)]">
                  Score: {scoreLabel}
                </span>
              )}
            </div>
          ) : (
            <Button
              variant="nb_btn_primary"
              size="nb_btn_sm"
              disabled={selectedOptionId === undefined}
              onClick={onCheckAnswer}
            >
              Check answer
            </Button>
          )}
        </div>

        {/* Explanation well after check */}
        {isChecked && question.explanation ? (
          <Well bordered className="p-[var(--nb-space-3)] text-xs text-[var(--nb-ink-2)]">
            <span className="font-semibold text-[var(--nb-ink)]">Explanation: </span>
            {question.explanation}
          </Well>
        ) : null}
      </Card>
    );
  }
);

QuizQuestion.displayName = "QuizQuestion";
