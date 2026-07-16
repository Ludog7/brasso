/**
 * Création / rectification d'un membre (M6-09). `memberNumber` **verrouillé en
 * édition** (immuable côté API). `birthDate` **optionnelle** avec mention de
 * minimisation (§6). Rôles associatifs en multi-sélection. En édition, le panneau
 * de consentements est affiché sous l'identité (fiche complète). Validation alignée
 * sur les schémas core (nom/prénom requis).
 */

import type { AssociativeRole } from "@brasso/core";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { Member, MemberCreateInput } from "@/lib/api";
import { canRunRgpd } from "@/lib/rbac";
import { useSession } from "@/stores/session";
import { Button } from "@/ui/button";
import { DialogShell } from "@/ui/dialog-shell";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

import { ConsentPanel } from "./ConsentPanel";
import { useCreateMember, useUpdateMember } from "./hooks";
import { ASSOCIATIVE_ROLE_LABELS, ASSOCIATIVE_ROLES } from "./labels";
import { RgpdActions } from "./RgpdActions";

/** ISO (`1990-05-01T…`) → valeur d'un `<input type=date>` (`1990-05-01`). */
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function MemberFormDialog({ member, onClose }: { member?: Member; onClose: () => void }) {
  const editing = member !== undefined;
  const sessionRoles = useSession((s) => s.user?.roles ?? []);
  const create = useCreateMember();
  const update = useUpdateMember(member?.id ?? "");
  const mutation = editing ? update : create;

  const [memberNumber, setMemberNumber] = useState(member?.memberNumber ?? "");
  const [firstName, setFirstName] = useState(member?.firstName ?? "");
  const [lastName, setLastName] = useState(member?.lastName ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [address, setAddress] = useState(member?.address ?? "");
  const [birthDate, setBirthDate] = useState(toDateInput(member?.birthDate ?? null));
  const [roles, setRoles] = useState<AssociativeRole[]>(member?.roles ?? []);
  const [error, setError] = useState<string | null>(null);

  const toggleRole = (role: AssociativeRole): void => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (firstName.trim() === "" || lastName.trim() === "") {
      setError("Le prénom et le nom sont obligatoires.");
      return;
    }
    if (!editing && memberNumber.trim() === "") {
      setError("Le numéro d'adhérent est obligatoire.");
      return;
    }
    setError(null);

    const identity = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      // Champs optionnels : omis si vides (l'API refuse une chaîne vide/email invalide).
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(address.trim() ? { address: address.trim() } : {}),
      ...(birthDate ? { birthDate } : {}),
      roles,
    };

    if (editing) {
      update.mutate(identity, { onSuccess: onClose });
    } else {
      const input: MemberCreateInput = { memberNumber: memberNumber.trim(), ...identity };
      create.mutate(input, { onSuccess: onClose });
    }
  };

  return (
    <DialogShell
      title={editing ? "Fiche membre" : "Nouveau membre"}
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="member-number">N° adhérent</Label>
          <Input
            id="member-number"
            value={memberNumber}
            disabled={editing}
            onChange={(e) => setMemberNumber(e.target.value)}
          />
          {editing ? (
            <p className="text-xs text-muted-foreground">
              Le numéro d'adhérent n'est pas modifiable.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="member-first">Prénom</Label>
            <Input
              id="member-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="member-last">Nom</Label>
            <Input
              id="member-last"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="member-email">Email</Label>
          <Input
            id="member-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="member-phone">Téléphone</Label>
            <Input id="member-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="member-birth">Date de naissance</Label>
            <Input
              id="member-birth"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optionnelle — renseignez uniquement si nécessaire.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="member-address">Adresse</Label>
          <Input id="member-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Rôles associatifs</legend>
          <div className="flex flex-col gap-2">
            {ASSOCIATIVE_ROLES.map((role) => (
              <label key={role} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={roles.includes(role)}
                  onChange={() => toggleRole(role)}
                />
                {ASSOCIATIVE_ROLE_LABELS[role]}
              </label>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        ) : null}
        {mutation.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            Enregistrement impossible. Réessayez.
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Annuler
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : null}
            {editing ? "Enregistrer" : "Créer le membre"}
          </Button>
        </div>
      </form>

      {editing && member ? (
        <div className="mt-2 border-t border-border pt-4">
          <ConsentPanel memberId={member.id} />
        </div>
      ) : null}

      {editing && member && canRunRgpd(sessionRoles) ? (
        <div className="mt-2 border-t border-border pt-4">
          <RgpdActions member={member} />
        </div>
      ) : null}
    </DialogShell>
  );
}
