import { createEventStream } from "@/lib/eventStream";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return new Response(createEventStream(request.signal), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
