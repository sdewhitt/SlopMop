import type { SiteAdapter } from "./adapters/SiteAdapter";
import type { NormalizedPostContent, ContentType } from "@src/types/domain";
import { classify } from "./ContentTypeClassifier";


export class PostExtractor {
    // Extracts content using SiteAdapters and returns NormalizedPostContents. 
    // Returns null if extraction fails for a post

    extract(postNode: Element, adapter: SiteAdapter): NormalizedPostContent | null {
        const siteId = adapter.getSiteId(); 
        const postId = adapter.getStablePostId(postNode);
        if (postId === null) return null;
        
        const capturedAtMs = Date.now();

        // get normalizedText
        // need to better understand role of ? in typescript
        // ?.innerText is optional chaining. if getTextNode rtns null, whole line evals to undefined
        // ?.trim() checks if innerText was null and returns trim()
        // ?? nullish coalescing operator. if first half was null/undefined, then return ''
        const rawText =  adapter.getTextNode(postNode)?.innerText?.trim() ?? '';
        if (rawText === null) return null;
        const normalizedText = this.normalizeText(rawText);
        if (normalizedText === null) return null;

        // TODO: process images into some normalized form after basic functionality is working
        // convert HTMLImageElement[] into a Array<{imageId, bytesBase64, srcUrl, mimeType}
        // mimeType means file format
        // const images = adapter.getImageNodes(postNode);
        // for (let img in images) {
        //     const srcUrl = img.currentSrc || img.src;
        //     const imageId = this.fnv1a(srcUrl);
        //     // call helper to get filetype

        //     // convert pixel data to base64 encoded string
        //     document.createElement("canvas");
        //     canvas.width = img.naturalWidth;
        //     canvas.height = img.naturalHeight;
        //     ctx.drawImage(img, 0, 0);
        //     const whole = canvas.toDataUrl("image/png");
        //     const bytesBase64 = whole.split(",")[1];



        // }

        // classify ContentType
        const contentType = classify(normalizedText, images.length);

        const permalink = adapter.getPermalink(postNode);
        // TODO: figure out how to get this and what this means
        const languageHint = "";
        const authorHandle = adapter.getAuthorHandle(postNode);
        const timestampText = adapter.getTimestampText(postNode);



        return {
            site: siteId,
            postId: postId,
            url: permalink ?? "",
            capturedAtMs: capturedAtMs,
            contentType: contentType,
            text: {
              plain: normalizedText,
              languageHint: "",
            },
            images: [],
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

    private fnv1a(input: string): string {
        let hash = 0x811c9dc5;
        for (let i = 0; i < input.length; i++) {
          hash ^= input.charCodeAt(i);
          hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16);
      }
}

