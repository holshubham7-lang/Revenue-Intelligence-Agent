import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { csrfPasses } from "@/lib/auth/csrf";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { findCompanyByUserId } from "@/lib/companies";
import { deleteSourceFile, listSourceFiles } from "@/lib/data/pipeline";

export const runtime = "nodejs";

/**
 * Lists this company's uploaded files. `GET` is safe so it needs no CSRF token;
 * `DELETE` is state-changing and does.
 *
 * Only filename, size, and hash are returned. `blobPath` is deliberately omitted:
 * it is a storage locator, and a client that never sees it cannot be used to
 * probe for another company's blobs.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await resolveSessionUser(token);
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired." } },
      { status: 401 },
    );
  }

  const company = await findCompanyByUserId(user._id);
  if (!company) {
    return NextResponse.json({ files: [] }, { status: 200 });
  }

  const files = await listSourceFiles(company._id);

  return NextResponse.json(
    {
      files: files.map((file) => ({
        id: file._id,
        name: file.originalName,
        extension: file.extension,
        sizeBytes: file.sizeBytes,
        rowCount: file.rowCount ?? null,
        status: file.status,
        createdAt: file.createdAt,
      })),
    },
    { status: 200 },
  );
}

export async function DELETE(request: NextRequest) {
  if (!csrfPasses(request)) {
    return NextResponse.json(
      { error: { code: "csrf_failed", message: "Session token missing or invalid." } },
      { status: 403 },
    );
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await resolveSessionUser(token);
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired." } },
      { status: 401 },
    );
  }

  const company = await findCompanyByUserId(user._id);
  if (!company) {
    return NextResponse.json({ error: { code: "not_found", message: "No company found." } }, { status: 404 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: { code: "invalid_request", message: "A file id is required." } }, { status: 400 });
  }

  const deleted = await deleteSourceFile(company._id, id);
  if (!deleted) {
    return NextResponse.json({ error: { code: "not_found", message: "That file wasn't found." } }, { status: 404 });
  }

  return NextResponse.json({ deleted: true }, { status: 200 });
}
