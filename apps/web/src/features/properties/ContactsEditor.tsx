import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PROPERTY_CONTACT_ROLES,
  type PropertyContactRole,
  type PropertyContactSummary,
} from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { Banner } from "../../components/ui/Banner";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { maskPhone } from "../../lib/masks";
import { addContact, fetchProperty, removeContact } from "./api";
import { CONTACT_ROLE_LABELS } from "./labels";

/**
 * Pessoas envolvidas no imóvel: proprietário, parceiros, chaves, agendamento.
 * Uma pessoa pode ter mais de um papel.
 */
export function ContactsEditor({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["property", propertyId],
    queryFn: () => fetchProperty(propertyId),
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<PropertyContactRole[]>([]);
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [creci, setCreci] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<PropertyContactSummary | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["property", propertyId] });

  const createMutation = useMutation({
    mutationFn: () =>
      addContact(propertyId, {
        name: name.trim(),
        roles,
        whatsapp: whatsapp || undefined,
        email: email || undefined,
        creci: creci || undefined,
        agencyName: agencyName || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setName("");
      setRoles([]);
      setWhatsapp("");
      setEmail("");
      setCreci("");
      setAgencyName("");
      setNotes("");
      setFormError(null);
    },
    onError: () => setFormError("Não foi possível salvar o contato. Tente novamente."),
  });

  const removeMutation = useMutation({
    mutationFn: (contactId: string) => removeContact(propertyId, contactId),
    onSuccess: () => {
      invalidate();
      setToRemove(null);
    },
  });

  const contacts = query.data?.contacts ?? [];

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-h3 text-text">Pessoas envolvidas</h3>
        {!showForm && (
          <Button type="button" variant="ghost" onClick={() => setShowForm(true)}>
            Adicionar
          </Button>
        )}
      </div>

      {contacts.length === 0 && !showForm && (
        <p className="text-body-sm text-text-muted">
          Registre quem participa deste imóvel: proprietário, responsável pelas chaves, contato
          para agendamento.
        </p>
      )}

      {contacts.length > 0 && (
        <ul className="divide-y divide-border">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-body font-semibold text-text">{contact.name}</p>
                <p className="mt-0.5 text-body-sm text-text-muted">
                  {contact.roles.map((r) => CONTACT_ROLE_LABELS[r]).join(" · ")}
                </p>
                {(contact.whatsapp || contact.email) && (
                  <p className="mt-0.5 truncate text-body-sm text-text-subtle">
                    {[contact.whatsapp, contact.email].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setToRemove(contact)}
                className="shrink-0 text-body-sm font-semibold text-[var(--danger-fg)] hover:underline"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-bg p-4">
          {formError && <Banner variant="danger">{formError}</Banner>}
          <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <fieldset>
            <legend className="text-label text-text">Papéis</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PROPERTY_CONTACT_ROLES.map((role) => {
                const active = roles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setRoles((current) =>
                        active ? current.filter((r) => r !== role) : [...current, role],
                      )
                    }
                    className={
                      "min-h-9 rounded-full border px-3 text-body-sm font-medium transition-colors duration-fast " +
                      (active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border bg-surface text-text-muted hover:bg-surface-sunken")
                    }
                  >
                    {CONTACT_ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="WhatsApp"
              optionalLabel="opcional"
              inputMode="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
            />
            <TextField
              label="E-mail"
              optionalLabel="opcional"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              label="CRECI"
              optionalLabel="quando aplicável"
              value={creci}
              onChange={(e) => setCreci(e.target.value)}
            />
            <TextField
              label="Imobiliária"
              optionalLabel="quando aplicável"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
            />
          </div>
          <TextField
            label="Observações internas"
            optionalLabel="opcional"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="accent"
              loading={createMutation.isPending}
              onClick={() => {
                if (name.trim().length < 2) {
                  setFormError("Informe o nome do contato.");
                  return;
                }
                if (roles.length === 0) {
                  setFormError("Escolha ao menos um papel.");
                  return;
                }
                createMutation.mutate();
              }}
            >
              Salvar contato
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toRemove)}
        title="Remover contato"
        description={`Remover ${toRemove?.name ?? ""} das pessoas envolvidas neste imóvel?`}
        confirmLabel="Remover"
        danger
        loading={removeMutation.isPending}
        onConfirm={() => toRemove && removeMutation.mutate(toRemove.id)}
        onCancel={() => setToRemove(null)}
      />
    </section>
  );
}
