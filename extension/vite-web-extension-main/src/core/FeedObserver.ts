import type { SiteAdapter } from "./adapters/SiteAdapter";
import type { NormalizedPostContent } from "@src/types/domain";


export class FeedObserver {

    extract(postNode: Element, adapter: SiteAdapter): NormalizedPostContent | null {
        const siteId = adapter.getSiteId(); 
        const postId = adapter.getStablePostId(postNode);
        if (postId === null) return null;
        
        const capturedAtMs = Date.now();
        const rawText = adapter.getTextNode(postNode);

        
        // collapse whitespace into a single space
        // const collapsedText = rawText?.match(/[ \t]+/g, "")
        // const newlinedText = collapseText?.



        return null;
    
    
            
    
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
}

