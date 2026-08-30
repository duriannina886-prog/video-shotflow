import { STYLE_PRESETS } from "@/lib/style-presets";
import { jsonOk } from "@/lib/api";

export async function GET() {
  return jsonOk({
    presets: STYLE_PRESETS.map(({ key, name, description }) => ({
      key,
      name,
      description,
    })),
  });
}
