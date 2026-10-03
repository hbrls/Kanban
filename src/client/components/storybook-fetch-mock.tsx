import { useEffect } from "react";

export interface StoryFetchRoute {
  match: (url: string, init?: RequestInit) => boolean;
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>;
}

export function createFetchMockDecorator(
  routes: StoryFetchRoute[],
  minHeightClass = "min-h-[320px]",
) {
  function StoryFetchDecorator(Story: React.ComponentType) {
    return (
      <StorybookFetchMock routes={routes}>
        <div className={`${minHeightClass} p-8`}>
          <Story />
        </div>
      </StorybookFetchMock>
    );
  }

  StoryFetchDecorator.displayName = "StoryFetchDecorator";

  return StoryFetchDecorator;
}

export function StorybookFetchMock({
  routes,
  children,
}: {
  routes: StoryFetchRoute[];
  children: React.ReactNode;
}) {
  useEffect(() => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      for (const route of routes) {
        if (route.match(url, init)) {
          return route.respond(url, init);
        }
      }

      return jsonResponse(
        { error: `Unhandled Storybook fetch: ${url}` },
        { status: 500 },
      );
    }) as typeof fetch;

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [routes]);

  return <>{children}</>;
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
}

export function sseResponse(events: Array<Record<string, unknown>>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
