"use client";

import {
  forwardRef,
  useId,
  type ComponentPropsWithRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import styles from "./ui.module.css";

export { styles };

type Variant = "primary" | "secondary" | "tertiary";

export function Button({
  variant = "primary",
  busy = false,
  className,
  children,
  disabled,
  ...props
}: ComponentPropsWithRef<"button"> & {
  variant?: Variant;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={[styles.button, styles[variant], className]
        .filter(Boolean)
        .join(" ")}
    >
      {busy ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

interface FieldChrome {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

function FieldFrame({
  id,
  label,
  error,
  hint,
  required,
  children,
}: FieldChrome & { id: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <span id={`${id}-hint`} className={styles.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className={styles.fieldError}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string) {
  const ids = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return ids || undefined;
}

export const TextField = forwardRef<
  HTMLInputElement,
  FieldChrome & InputHTMLAttributes<HTMLInputElement>
>(function TextField({ label, error, hint, required, id, ...props }, ref) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldFrame
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      required={required}
    >
      <input
        ref={ref}
        id={fieldId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        {...props}
      />
    </FieldFrame>
  );
});

export const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  FieldChrome & TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextAreaField({ label, error, hint, required, id, ...props }, ref) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldFrame
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      required={required}
    >
      <textarea
        ref={ref}
        id={fieldId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        {...props}
      />
    </FieldFrame>
  );
});

export function SelectField({
  label,
  error,
  hint,
  required,
  id,
  children,
  ...props
}: FieldChrome & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldFrame
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      required={required}
    >
      <select
        id={fieldId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

/** Errors interrupt (role=alert); information waits (role=status). */
export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? undefined : "polite"}
      className={[
        styles.alert,
        tone === "error" ? styles.alertError : styles.alertInfo,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

type BadgeTone = "agent" | "draft" | "neutral" | "error" | "ok";
const badgeClass: Record<BadgeTone, string> = {
  agent: styles.badgeAgent,
  draft: styles.badgeDraft,
  neutral: styles.badgeNeutral,
  error: styles.badgeError,
  ok: styles.badgeOk,
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span className={[styles.badge, badgeClass[tone]].join(" ")}>
      {children}
    </span>
  );
}

export function Loading({
  children = "Carregando…",
}: {
  children?: ReactNode;
}) {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Card({
  children,
  labelledBy,
  className,
}: {
  children: ReactNode;
  labelledBy?: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={[styles.card, className].filter(Boolean).join(" ")}
    >
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className={styles.row}>{actions}</div> : null}
    </header>
  );
}

export const ROLE_LABEL = { broker: "Corretor", supervisor: "Supervisor" };

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
