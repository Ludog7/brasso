-- Bug #221 — assouplit l'append-only d'ExternalTransaction.
--
-- Le rapprochement (M6-08 cotisation→membre, M7-05 vente→stock) doit pouvoir
-- écrire les champs INTERNES `status` (UNMAPPED→MAPPED) et `memberId`. L'invariant
-- append-only (ADR-09) doit protéger les DONNÉES EXTERNES (payload provider,
-- montant, identifiants, date), pas ces champs internes de traitement.
--
-- On remplace donc le trigger générique (qui interdisait tout UPDATE) par un garde
-- dédié : UPDATE autorisé uniquement si aucune colonne externe ne change ; DELETE
-- toujours interdit. `StockMovement` et `AuditLog` conservent l'append-only strict
-- (fonction `brasso_append_only`, inchangée).

CREATE OR REPLACE FUNCTION brasso_external_tx_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Table %.% est append-only : DELETE interdit', TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Seuls `status` et `memberId` (rapprochement) sont modifiables : toute
  -- divergence sur une colonne externe est refusée (donnée provider immuable).
  IF NEW."providerId" IS DISTINCT FROM OLD."providerId"
    OR NEW."externalId" IS DISTINCT FROM OLD."externalId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."amountCents" IS DISTINCT FROM OLD."amountCents"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."paymentMethod" IS DISTINCT FROM OLD."paymentMethod"
    OR NEW."externalProductId" IS DISTINCT FROM OLD."externalProductId"
    OR NEW."occurredAt" IS DISTINCT FROM OLD."occurredAt"
    OR NEW."rawPayload" IS DISTINCT FROM OLD."rawPayload"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'ExternalTransaction : donnée externe immuable (ADR-09) — seuls status et memberId sont modifiables'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ExternalTransaction_append_only" ON "ExternalTransaction";

CREATE TRIGGER "ExternalTransaction_reconcilable"
  BEFORE UPDATE OR DELETE ON "ExternalTransaction"
  FOR EACH ROW EXECUTE FUNCTION brasso_external_tx_guard();
