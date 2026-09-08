import Image from "next/image";
import { PHOTOS, hasPhoto, type PhotoSlot } from "@/lib/site/photos";

interface PhotoProps {
  slot: PhotoSlot;
  /** De eerste foto boven de vouw laadt met voorrang; de rest lazy. */
  priority?: boolean;
  /** Breedtes die de browser mag kiezen. */
  sizes?: string;
  className?: string;
  /** Bijschrift tonen (uit lib/site/photos.ts). Uit voor beelden die in een sectie overlopen. */
  showCaption?: boolean;
  rounded?: boolean;
}

/**
 * Eén foto in de huisgrading. De twee overlays maken van elke opname dezelfde duotone —
 * inkt in de schaduwen, het signaalblauw in de lichten — waardoor losse foto's als één
 * serie lezen en in dezelfde palet blijven als de grafieken.
 *
 * Ontbreekt het bestand nog, dan rendert dit component niets en houdt de sectie haar
 * typografische opmaak.
 */
export function Photo({
  slot,
  priority = false,
  sizes = "100vw",
  className = "",
  showCaption = true,
  rounded = true,
}: PhotoProps) {
  if (!hasPhoto(slot)) return null;
  const photo = PHOTOS[slot];

  return (
    <figure className={className}>
      <div
        className={`site-photo relative overflow-hidden ${photo.ratio} ${rounded ? "rounded-2xl" : ""}`}
      >
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          priority={priority}
          sizes={sizes}
          className={`object-cover ${photo.position ?? ""}`}
        />
      </div>
      {showCaption && photo.caption && (
        <figcaption className="mt-3 text-sm text-site-text-muted">{photo.caption}</figcaption>
      )}
    </figure>
  );
}

/**
 * Breed beeld dat in het donkere vlak eronder overloopt: onderaan verdwijnt de foto in de
 * inktkleur, zodat de foto en de sectie één geheel worden in plaats van twee blokken.
 */
export function PhotoBand({ slot }: { slot: PhotoSlot }) {
  if (!hasPhoto(slot)) return null;
  const photo = PHOTOS[slot];

  return (
    <div className={`site-photo site-photo--band relative w-full ${photo.ratio}`}>
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes="100vw"
        className={`object-cover ${photo.position ?? ""}`}
      />
    </div>
  );
}
