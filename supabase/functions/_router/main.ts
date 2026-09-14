// Self-hosted router: объединяет все edge-функции в один процесс (deno run).
// Облако его не использует (там каждая функция деплоится отдельно через index.ts).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handler as logConsume } from "../log-consume-sheet/handler.ts";
import { handler as notifyAssembly } from "../notify-assembly-ready/handler.ts";
import { handler as syncLeftovers } from "../sync-leftovers-sheet/handler.ts";
import { handler as syncMaterials } from "../sync-materials-stock/handler.ts";

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "log-consume-sheet": logConsume,
  "notify-assembly-ready": notifyAssembly,
  "sync-leftovers-sheet": syncLeftovers,
  "sync-materials-stock": syncMaterials,
};

serve(async (req: Request) => {
  const name = new URL(req.url).pathname
    .replace(/^\/functions\/v1\//, "")
    .replace(/^\//, "")
    .split("/")[0];
  const fn = routes[name];
  if (!fn) {
    return new Response(JSON.stringify({ error: `function not found: ${name}` }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return fn(req);
}, { port: 54321 });
