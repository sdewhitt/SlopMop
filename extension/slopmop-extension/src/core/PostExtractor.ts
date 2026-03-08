import type { SiteAdapter } from "./adapters/SiteAdapter";
import type { NormalizedPostContent, ContentType } from "@src/types/domain";
import { classify } from "./ContentTypeClassifier";


export class PostExtractor {
    // Extracts content using SiteAdapters and returns NormalizedPostContents. 
    // Returns null if extraction fails for a post

    extract(node: Element, adapter: SiteAdapter, type: "post" | "comment"): NormalizedPostContent | null {
        const siteId = adapter.getSiteId(); 
        // post or comment id
        const id = type === "post" 
            ? adapter.getStablePostId(node) 
            : adapter.getCommentId(node);
        
        if (id === null) return null;
        
        const capturedAtMs = Date.now();

        // get normalizedText
        // need to better understand role of ? in typescript
        // ?.innerText is optional chaining. if getTextNode rtns null, whole line evals to undefined
        // ?.trim() checks if innerText was null and returns trim()
        // ?? nullish coalescing operator. if first half was null/undefined, then return ''
        const textNode = type === "post"
            ? adapter.getTextNode(node)
            : adapter.getCommentTextNode(node);

        const rawText = textNode?.innerText?.trim() ?? '';
        // normalize before classification so repeated whitespace doesn't skew downstream heuristics.
        const normalizedText = this.normalizeText(rawText);

        // extract images before the empty-text guard so image-only posts aren't dropped.
        const imageNodes = type === "post" ? adapter.getImageNodes(node) : [];
        const images = imageNodes.map((img) => {
            const srcUrl = img.currentSrc || img.src;
            return {
                imageId: this.fnv1a(srcUrl),
                bytesBase64: "",            // background will fill bytes in
                srcUrl,
                mimeType: this.mimeTypeFromUrl(srcUrl),
            };
        });

        // drop the post only when there's no text AND no images.
        if (!normalizedText && images.length === 0) return null;

        // classify ContentType
        const contentType = classify(normalizedText, images.length);

        const permalink = type === "post"
            ? adapter.getPermalink(node)
            : adapter.getCommentPermalink(node);

        // TODO: figure out how to get this and what this means
        const languageHint = "";
        
        // author and timestamp are currently only implemented for posts in the adapter
        const authorHandle = type === "post" ? adapter.getAuthorHandle(node) : "";
        const timestampText = type === "post" ? adapter.getTimestampText(node) : "";

        return {
            site: siteId,
            postId: id,
            url: permalink ?? "",
            capturedAtMs: capturedAtMs,
            contentType: contentType,
            text: {
              plain: normalizedText,
              languageHint: "",
            },
            images: images,
            domContext: {
              authorHandle: authorHandle ?? "",
              timestampText: timestampText ?? "",
            },
          };
    
    }
    private normalizeText(raw: string | null): string {
        if (!raw) return "";
        let text = raw;
        // replace whitespace [ \t]+ matches exactly 1 or more space. 
        // g is global flag to replace all instances
        text = text.replace(/[ \t]+/g, " ");
        // normalize paragraph breaks. capture two or more \n and globally
        text = text.replace(/\n{2,}/g, "\n\n");
        // replace multiple newlines with single newline
        text = text.replace(/\n /g, "\n");
        // trim leading and trailing whitespace
        text = text.trim();

        return text;
    }
    private mimeTypeFromUrl(url: string): string {
        // mimetype is just image filetype
        // not sure what how this line works
        const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
        const map: Record<string, string> = {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            webp: "image/webp",
            gif: "image/gif",
            svg: "image/svg+xml",
            avif: "image/avif",
        };
        return (ext && map[ext]) || "image/jpeg";
    }
    // hash function for unique postId
    private fnv1a(input: string): string {
        let hash = 0x811c9dc5;
        for (let i = 0; i < input.length; i++) {
          hash ^= input.charCodeAt(i);
          hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16);
      }
}

