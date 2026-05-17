import { env } from "@/lib/env";

export type PexelsPhoto = {
  id: number;
  url: string;
  photographer: string;
  src: {
    large2x: string;
    large: string;
    medium: string;
  };
};

type SearchResult =
  | { ok: true; photos: PexelsPhoto[] }
  | { ok: false; error: string };

export async function searchPhotos(
  query: string,
  perPage = 12
): Promise<SearchResult> {
  if (!env.PEXELS_API_KEY) {
    return { ok: false, error: "Pexels API key not configured" };
  }

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: env.PEXELS_API_KEY },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return { ok: false, error: `Pexels error: ${res.status}` };
    }

    const data = (await res.json()) as { photos: PexelsPhoto[] };
    return { ok: true, photos: data.photos };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to fetch photos",
    };
  }
}
