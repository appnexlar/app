import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MEDIA_ORIGINS,
  PHOTO_ROOMS,
  type MediaOrigin,
  type PhotoRoom,
  type PropertyMediaSummary,
} from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { Select } from "../../components/ui/Select";
import { TextField } from "../../components/ui/TextField";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import {
  addExternalMedia,
  deleteMedia,
  fetchProperty,
  updateMedia,
  uploadMedia,
} from "./api";
import { AuthImage } from "./AuthImage";
import { MEDIA_ORIGIN_LABELS, PHOTO_ROOM_LABELS } from "./labels";

/**
 * Fotos, vídeos e links do imóvel. A mídia pertence ao cadastro do corretor
 * mesmo com origem externa, e a origem fica registrada. A autorização de
 * divulgação é do anúncio inteiro, declarada quando o corretor põe o imóvel na
 * página pública: aqui não se autoriza foto a foto.
 */

interface UploadingItem {
  key: string;
  name: string;
  percent: number;
  error: string | null;
}

export function MediaManager({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["property", propertyId],
    queryFn: () => fetchProperty(propertyId),
  });

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [origin, setOrigin] = useState<MediaOrigin>("corretor");
  const [room, setRoom] = useState<PhotoRoom | "">("");
  const [uploads, setUploads] = useState<UploadingItem[]>([]);
  const [toRemove, setToRemove] = useState<PropertyMediaSummary | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [externalCaption, setExternalCaption] = useState("");
  const [externalError, setExternalError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
    void queryClient.invalidateQueries({ queryKey: ["properties"] });
  };

  async function handleFiles(files: FileList | null, kind: "foto" | "video") {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      setUploads((u) => [...u, { key, name: file.name, percent: 0, error: null }]);
      try {
        await uploadMedia(
          propertyId,
          file,
          { kind, origin, authorized: true, room: room || undefined },
          (percent) => {
            setUploads((u) => u.map((item) => (item.key === key ? { ...item, percent } : item)));
          },
        );
        setUploads((u) => u.filter((item) => item.key !== key));
        invalidate();
      } catch (e) {
        setUploads((u) =>
          u.map((item) =>
            item.key === key
              ? { ...item, error: e instanceof Error ? e.message : "Falha no envio." }
              : item,
          ),
        );
      }
    }
  }

  const removeMutation = useMutation({
    mutationFn: (mediaId: string) => deleteMedia(propertyId, mediaId),
    onSuccess: () => {
      invalidate();
      setToRemove(null);
    },
  });

  const coverMutation = useMutation({
    mutationFn: (mediaId: string) => updateMedia(propertyId, mediaId, { isCover: true }),
    onSuccess: invalidate,
  });

  const externalMutation = useMutation({
    mutationFn: () =>
      addExternalMedia(propertyId, {
        kind: "link_externo",
        externalUrl: externalUrl.trim(),
        caption: externalCaption || undefined,
        origin: "link_externo",
      }),
    onSuccess: () => {
      invalidate();
      setExternalUrl("");
      setExternalCaption("");
      setExternalError(null);
    },
    onError: () => setExternalError("Confira o link e tente novamente."),
  });

  const media = query.data?.media ?? [];
  const photos = media.filter((m) => m.kind === "foto");
  const videos = media.filter((m) => m.kind === "video");
  const links = media.filter((m) => m.kind === "link_externo");

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="text-h3 text-text">Enviar mídia</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Origem da mídia"
            value={origin}
            options={MEDIA_ORIGINS.filter((o) => o !== "link_externo").map((o) => ({
              value: o,
              label: MEDIA_ORIGIN_LABELS[o],
            }))}
            onValueChange={(v) => setOrigin(v as MediaOrigin)}
          />
          <Select
            label="Ambiente da foto"
            value={room}
            placeholder="Escolher depois"
            options={PHOTO_ROOMS.map((r) => ({ value: r, label: PHOTO_ROOM_LABELS[r] }))}
            onValueChange={(v) => setRoom(v as PhotoRoom | "")}
          />
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button type="button" variant="accent" onClick={() => photoInputRef.current?.click()}>
            Adicionar fotos
          </Button>
          <Button type="button" variant="ghost" onClick={() => videoInputRef.current?.click()}>
            Adicionar vídeo
          </Button>
        </div>
        <p className="text-caption text-text-subtle">
          Tudo que você enviar aqui entra no anúncio. Se o imóvel estiver na sua página pública,
          essas fotos aparecem para quem visitar.
        </p>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files, "foto");
            e.target.value = "";
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/quicktime"
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files, "video");
            e.target.value = "";
          }}
        />

        {uploads.length > 0 && (
          <ul className="flex flex-col gap-2">
            {uploads.map((item) => (
              <li key={item.key} className="rounded-lg border border-border bg-bg p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-body-sm text-text">{item.name}</p>
                  {item.error ? (
                    <button
                      type="button"
                      onClick={() => setUploads((u) => u.filter((x) => x.key !== item.key))}
                      className="text-body-sm font-semibold text-[var(--danger-fg)]"
                    >
                      Fechar
                    </button>
                  ) : (
                    <span className="text-caption tabular-nums text-text-subtle">
                      {item.percent}%
                    </span>
                  )}
                </div>
                {item.error ? (
                  <p className="mt-1 text-caption text-[var(--danger-fg)]">{item.error}</p>
                ) : (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-accent transition-[width]"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {photos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-h3 text-text">Fotos ({photos.length})</h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <li key={photo.id} className="group relative overflow-hidden rounded-xl border border-border">
                {photo.url && (
                  <AuthImage src={photo.url} alt={photo.caption ?? "Foto do imóvel"} className="aspect-[4/3] w-full object-cover" />
                )}
                {photo.isCover && (
                  <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-caption font-semibold text-primary-on">
                    Capa
                  </span>
                )}
                {photo.room && (
                  <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-caption font-medium text-white">
                    {PHOTO_ROOM_LABELS[photo.room]}
                  </span>
                )}
                <div className="absolute right-2 top-2 flex gap-1.5">
                  {!photo.isCover && (
                    <button
                      type="button"
                      title="Definir como capa"
                      onClick={() => coverMutation.mutate(photo.id)}
                      className="rounded-full bg-black/55 px-2 py-1 text-caption font-medium text-white hover:bg-black/75"
                    >
                      Capa
                    </button>
                  )}
                  <button
                    type="button"
                    title="Excluir foto"
                    aria-label="Excluir foto"
                    onClick={() => setToRemove(photo)}
                    className="rounded-full bg-black/55 px-2 py-1 text-caption font-medium text-white hover:bg-black/75"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {videos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-h3 text-text">Vídeos ({videos.length})</h3>
          <ul className="flex flex-col gap-2">
            {videos.map((video) => (
              <li
                key={video.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8 6.8v10.4a1 1 0 001.53.85l8.24-5.2a1 1 0 000-1.7L9.53 5.95A1 1 0 008 6.8z" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-body-sm font-semibold text-text">
                      {video.caption ?? "Vídeo do imóvel"}
                    </p>
                    <p className="text-caption text-text-subtle">
                      {video.status === "pronto"
                        ? MEDIA_ORIGIN_LABELS[video.origin]
                        : video.status === "falhou"
                          ? "Falha no processamento"
                          : "Processando..."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setToRemove(video)}
                  className="text-body-sm font-semibold text-[var(--danger-fg)] hover:underline"
                >
                  Excluir
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="text-h3 text-text">Link externo</h3>
        <p className="text-body-sm text-text-muted">
          Vídeo no YouTube, tour virtual ou tour 360°: cole o link autorizado.
        </p>
        {externalError && <Banner variant="danger">{externalError}</Banner>}
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <TextField
            label="Link"
            placeholder="https://"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
          />
          <TextField
            label="Descrição"
            optionalLabel="opcional"
            placeholder="Tour virtual"
            value={externalCaption}
            onChange={(e) => setExternalCaption(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          loading={externalMutation.isPending}
          disabled={!externalUrl.trim()}
          onClick={() => externalMutation.mutate()}
        >
          Adicionar link
        </Button>
        {links.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {links.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-3">
                <a
                  href={link.externalUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-body-sm font-semibold text-accent hover:underline"
                >
                  {link.caption || link.externalUrl}
                </a>
                <button
                  type="button"
                  onClick={() => setToRemove(link)}
                  className="shrink-0 text-body-sm font-semibold text-[var(--danger-fg)] hover:underline"
                >
                  Excluir
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(toRemove)}
        title="Excluir mídia"
        description="Essa mídia será removida do imóvel e o arquivo apagado. Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        danger
        loading={removeMutation.isPending}
        onConfirm={() => toRemove && removeMutation.mutate(toRemove.id)}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
}
