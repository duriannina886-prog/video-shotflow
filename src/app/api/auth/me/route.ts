import { jsonOk } from "@/lib/api";
import { getAccess, viewerFromAccess } from "@/lib/auth";

export async function GET(req: Request) {
  const access = await getAccess(req);
  if (access.role === "none") {
    return jsonOk({ role: "none", viewer: null });
  }
  if (access.role === "owner") {
    return jsonOk({
      role: "owner",
      viewer: viewerFromAccess(access),
    });
  }
  return jsonOk({
    role: "reviewer",
    name: access.name,
    projectIds: access.projectIds,
    viewer: viewerFromAccess(access),
  });
}
