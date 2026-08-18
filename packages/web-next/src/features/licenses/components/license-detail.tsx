"use client";

import { ArrowLeftIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { DetailItem, DetailList } from "@/components/layout/detail-list";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows, PageState, QueryError } from "@/components/layout/query-states";
import { Value } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentsCard } from "@/features/contracts/components/documents-card";
import { useEntityIndex, useOutletIndex } from "@/features/registry/hooks";
import type { License } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import {
  DOC_TYPE_OPTIONS,
  LICENSE_STATUS_LABELS,
  LICENSE_STATUS_TONES,
} from "@/lib/labels";
import { DOCUMENT_ACCEPT } from "@/lib/uploads";

import { useLicense, useLicenseTypeIndex } from "../hooks";
import { LicenseForm } from "./license-form";

/**
 * One held licence, with the authoritative certificate attached to it.
 *
 * Licences were list-only until this page: the "Record a licence" sheet says "the certificate is
 * authoritative" yet had nowhere to put the paper. The certificate lives here, on the same shared
 * `DocumentsCard` the contract and tenancy pages use — the backend already carries `license` as an
 * attachment subject and `license_certificate` as a doc-type, so this is wiring, not new plumbing.
 */

// One authoritative certificate, plus room for renewal correspondence — not the full doc menu.
const LICENSE_DOC_TYPES = DOC_TYPE_OPTIONS.filter((option) =>
  ["license_certificate", "correspondence", "other"].includes(option.value),
);

export function LicenseDetail({ licenseId }: { licenseId: string }) {
  const { data: license, error, isLoading } = useLicense(licenseId);
  const { byId: typeById } = useLicenseTypeIndex();
  const { byId: outletById } = useOutletIndex();
  const { byId: entityById } = useEntityIndex();
  const [editOpen, setEditOpen] = React.useState(false);

  if (error) {
    return (
      <>
        <BackLink />
        <PageState>
          <QueryError error={error} />
        </PageState>
      </>
    );
  }
  if (isLoading || !license) {
    return (
      <>
        <BackLink />
        <PageState>
          <LoadingRows rows={4} />
        </PageState>
      </>
    );
  }

  const typeName = typeById.get(license.license_type_id)?.name;
  const outlet = license.outlet_id ? outletById.get(license.outlet_id) : undefined;
  const entity = entityById.get(license.holder_entity_id);
  // Entity-level, deliberately: 3 of the 29 types are held by the company, not a premises.
  const where = outlet?.name ?? entity?.name ?? "Entity-level";

  return (
    <>
      <BackLink />

      <PageHeader
        title={typeName ?? "Licence"}
        description={where}
        actions={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <PencilIcon data-icon="inline-start" />
            Edit
          </Button>
        }
      />

      <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={LICENSE_STATUS_TONES[license.status]}>
            {LICENSE_STATUS_LABELS[license.status]}
          </Badge>
          {license.holder_person_name ? (
            <Badge variant="outline">Held by {license.holder_person_name}</Badge>
          ) : null}
        </div>

        <RecordCard license={license} where={where} />

        <DocumentsCard
          subjectType="license"
          subjectId={license.id}
          defaultDocType="license_certificate"
          docTypeOptions={LICENSE_DOC_TYPES}
          title="Certificate"
          emptyLabel="No certificate attached yet — drop the certificate here, or use Upload."
          noun="certificate"
          accept={DOCUMENT_ACCEPT}
        />
      </div>

      <LicenseForm license={license} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

function RecordCard({ license, where }: { license: License; where: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificate details</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailList>
          <DetailItem label="Where">{where}</DetailItem>
          <DetailItem label="Licence number">
            <Value mono>{license.license_number}</Value>
          </DetailItem>
          <DetailItem label="Issued">
            {license.issue_date ? formatDate(license.issue_date) : null}
          </DetailItem>
          <DetailItem label="Expires">
            {license.expiry_date ? formatDate(license.expiry_date) : null}
          </DetailItem>
          <DetailItem label="Conditions">{license.conditions ?? null}</DetailItem>
          <DetailItem label="Notes">{license.notes ?? null}</DetailItem>
        </DetailList>
      </CardContent>
    </Card>
  );
}

function BackLink() {
  return (
    <div className="px-6 pt-6 md:px-8">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/licenses" />}>
        <ArrowLeftIcon data-icon="inline-start" />
        All licences
      </Button>
    </div>
  );
}
