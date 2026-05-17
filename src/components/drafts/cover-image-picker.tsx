"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { searchPexelsPhotos } from "@/actions/drafts";
import { ImageIcon, Search } from "lucide-react";

interface Photo {
  url: string;
  thumb: string;
  photographer: string;
}

interface CoverImagePickerProps {
  onSelect: (url: string) => void;
}

export function CoverImagePicker({ onSelect }: CoverImagePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSearch() {
    if (!query.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await searchPexelsPhotos(query.trim());
      if (result.ok) {
        setPhotos(result.data.photos);
      } else {
        setError(result.error);
        setPhotos([]);
      }
    });
  }

  function handleSelect(url: string) {
    onSelect(url);
    setOpen(false);
    setPhotos([]);
    setQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs">
          <ImageIcon className="h-3 w-3" />
          Pick from Pexels
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pick a Cover Image from Pexels</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Search photos…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="text-sm"
          />
          <Button onClick={handleSearch} disabled={isPending || !query.trim()} size="sm">
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        {isPending && (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-muted rounded h-32 w-full"
              />
            ))}
          </div>
        )}

        {!isPending && photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
            {photos.map((photo, i) => (
              <button
                key={i}
                className="relative group rounded overflow-hidden border border-border hover:border-primary transition-colors"
                onClick={() => handleSelect(photo.url)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumb}
                  alt={`Photo by ${photo.photographer}`}
                  className="w-full h-32 object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                  <p className="text-xs text-white truncate">
                    {photo.photographer}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {!isPending && photos.length === 0 && !error && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Search for photos above
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
