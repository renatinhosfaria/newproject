"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  LeadSchema,
  LeadStageSchema,
  type Lead,
  type LeadStage,
} from "@pacaembu/contracts";
import { api, describeError } from "../lib/api";
import { Alert, Button, SelectField, TextField, styles } from "./ui";

export const STAGE_LABEL: Record<LeadStage, string> = {
  novo: "Novo",
  contato: "Em contato",
  visita: "Visita",
  proposta: "Proposta",
  aprovado: "Aprovado",
  perdido: "Perdido",
};

interface Values {
  name: string;
  phone: string;
  email: string;
  source: string;
  interest: string;
  stage: LeadStage;
  next_action: string;
}

type Errors = Partial<Record<keyof Values, string>>;

function initialValues(lead?: Lead): Values {
  return {
    name: lead?.name ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    source: lead?.source ?? "",
    interest: lead?.interest ?? "",
    stage: lead?.stage ?? "novo",
    next_action: lead?.next_action ?? "",
  };
}

function validate(values: Values): Errors {
  const errors: Errors = {};
  const name = values.name.trim();
  if (name.length < 2)
    errors.name = "Informe um nome com pelo menos 2 caracteres.";
  else if (name.length > 160)
    errors.name = "Use no máximo 160 caracteres no nome.";
  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
    errors.email = "Informe um e-mail válido ou deixe em branco.";
  if (values.phone.length > 40)
    errors.phone = "Use no máximo 40 caracteres no telefone.";
  if (values.source.length > 80)
    errors.source = "Use no máximo 80 caracteres na origem.";
  if (values.interest.length > 160)
    errors.interest = "Use no máximo 160 caracteres no interesse.";
  if (values.next_action.length > 200)
    errors.next_action = "Use no máximo 200 caracteres no próximo passo.";
  return errors;
}

const optional = (value: string) => value.trim() || null;

export function LeadForm({
  lead,
  onSaved,
  onCancel,
}: {
  lead?: Lead;
  onSaved(lead: Lead): void;
  onCancel(): void;
}) {
  const editing = Boolean(lead);
  const [values, setValues] = useState<Values>(() => initialValues(lead));
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const set =
    (key: keyof Values) =>
    (event: { target: { value: string } }): void =>
      setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    setFailure(null);
    const first = Object.keys(found)[0];
    if (first) {
      form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const saved = lead
        ? await api(
            `/api/leads/${lead.id}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                name: values.name.trim(),
                phone: optional(values.phone),
                email: optional(values.email),
                interest: optional(values.interest),
                stage: values.stage,
                next_action: optional(values.next_action),
              }),
            },
            LeadSchema,
          )
        : await api(
            "/api/leads",
            {
              method: "POST",
              body: JSON.stringify({
                name: values.name.trim(),
                phone: optional(values.phone),
                email: optional(values.email),
                source: optional(values.source),
                interest: optional(values.interest),
              }),
            },
            LeadSchema,
          );
      onSaved(saved);
    } catch (error) {
      // Values stay in the form so the user can correct and resend.
      setFailure(describeError(error));
      setBusy(false);
    }
  }

  return (
    <form ref={form} className={styles.form} onSubmit={submit} noValidate>
      <p className={styles.hint}>Campos com * são obrigatórios.</p>
      {failure ? <Alert>{failure}</Alert> : null}
      <div className={styles.formGrid}>
        <TextField
          label="Nome"
          name="name"
          required
          maxLength={160}
          value={values.name}
          error={errors.name}
          onChange={set("name")}
        />
        <TextField
          label="Telefone"
          name="phone"
          type="tel"
          placeholder="Ex.: +55 11 91234-5678"
          value={values.phone}
          error={errors.phone}
          onChange={set("phone")}
        />
        <TextField
          label="E-mail"
          name="email"
          type="email"
          value={values.email}
          error={errors.email}
          onChange={set("email")}
        />
        {editing ? (
          <SelectField
            label="Etapa"
            name="stage"
            value={values.stage}
            onChange={set("stage")}
          >
            {LeadStageSchema.options.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABEL[stage]}
              </option>
            ))}
          </SelectField>
        ) : (
          <TextField
            label="Origem"
            name="source"
            placeholder="Ex.: Indicação"
            value={values.source}
            error={errors.source}
            onChange={set("source")}
          />
        )}
        <TextField
          label="Interesse"
          name="interest"
          value={values.interest}
          error={errors.interest}
          onChange={set("interest")}
        />
        {editing ? (
          <TextField
            label="Próximo passo"
            name="next_action"
            value={values.next_action}
            error={errors.next_action}
            onChange={set("next_action")}
          />
        ) : null}
      </div>
      <div className={styles.row}>
        <Button type="submit" busy={busy}>
          {editing ? "Salvar alterações" : "Salvar lead"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
