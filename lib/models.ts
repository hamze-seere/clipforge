// Catalog of video models served through Replicate.
// Each model has its own input schema, so `buildInput` maps our generic
// request onto that model's fields. Check the "API" tab of each model page on
// replicate.com when adding models: field names differ between them.

export type Aspect = "16:9" | "9:16" | "1:1";

export interface GenerateParams {
  prompt: string;
  image?: string; // data URI or https URL, for image-to-video
  aspect: Aspect;
  duration: number; // seconds
  negativePrompt?: string;
}

export interface VideoModel {
  id: string; // Replicate "owner/name", or "hf/..." for the free Hugging Face model
  /** "hf" runs on a free Hugging Face Space (lib/hf.ts); default is Replicate. */
  provider?: "replicate" | "hf";
  name: string;
  tagline: string;
  textToVideo: boolean;
  imageToVideo: boolean;
  requiresImage: boolean;
  aspects: Aspect[];
  durations: number[];
  credits: (p: GenerateParams) => number;
  buildInput: (p: GenerateParams) => Record<string, unknown>;
}

export const MODELS: VideoModel[] = [
  {
    id: "hf/ltx-2.3",
    provider: "hf",
    name: "LTX-2.3 Free",
    tagline: "Free on Hugging Face, real video",
    textToVideo: true,
    imageToVideo: true,
    requiresImage: false,
    aspects: ["16:9", "9:16", "1:1"],
    durations: [3, 5],
    credits: () => 0,
    buildInput: (p) => ({ prompt: p.prompt, image: p.image, aspect: p.aspect, duration: p.duration }),
  },
  {
    id: "wan-video/wan-2.2-t2v-fast",
    name: "Wan 2.2 Fast",
    tagline: "Cheap and quick drafts",
    textToVideo: true,
    imageToVideo: false,
    requiresImage: false,
    aspects: ["16:9", "9:16"],
    durations: [5],
    credits: () => 5,
    buildInput: (p) => ({ prompt: p.prompt, aspect_ratio: p.aspect }),
  },
  {
    id: "bytedance/seedance-1-lite",
    name: "Seedance Lite",
    tagline: "Good motion, text or image",
    textToVideo: true,
    imageToVideo: true,
    requiresImage: false,
    aspects: ["16:9", "9:16", "1:1"],
    durations: [5, 10],
    credits: (p) => (p.duration > 5 ? 20 : 10),
    buildInput: (p) => ({
      prompt: p.prompt,
      duration: p.duration,
      aspect_ratio: p.aspect,
      ...(p.image ? { image: p.image } : {}),
    }),
  },
  {
    id: "minimax/video-01",
    name: "MiniMax Video-01",
    tagline: "Cinematic 6s clips",
    textToVideo: true,
    imageToVideo: true,
    requiresImage: false,
    aspects: ["16:9"],
    durations: [6],
    credits: () => 15,
    buildInput: (p) => ({
      prompt: p.prompt,
      prompt_optimizer: true,
      ...(p.image ? { first_frame_image: p.image } : {}),
    }),
  },
  {
    id: "kwaivgi/kling-v2.1",
    name: "Kling 2.1",
    tagline: "Animate a photo",
    textToVideo: false,
    imageToVideo: true,
    requiresImage: true,
    aspects: ["16:9", "9:16", "1:1"],
    durations: [5, 10],
    credits: (p) => (p.duration > 5 ? 40 : 20),
    buildInput: (p) => ({
      prompt: p.prompt,
      start_image: p.image,
      duration: p.duration,
      ...(p.negativePrompt ? { negative_prompt: p.negativePrompt } : {}),
    }),
  },
  {
    id: "google/veo-3",
    name: "Veo 3",
    tagline: "Top quality, with audio",
    textToVideo: true,
    imageToVideo: true,
    requiresImage: false,
    aspects: ["16:9", "9:16"],
    durations: [8],
    credits: () => 80,
    buildInput: (p) => ({
      prompt: p.prompt,
      aspect_ratio: p.aspect,
      ...(p.image ? { image: p.image } : {}),
      ...(p.negativePrompt ? { negative_prompt: p.negativePrompt } : {}),
    }),
  },
];

export function getModel(id: string) {
  return MODELS.find((m) => m.id === id);
}
