// put imports here soon
import { ContentType } from "@src/types/domain";


    // determines contentType for a certain post
    // available options are text, image, mixed, unsupported.
    // ContentType is a string enum
export function classify(plainText: string, imageLength: number): ContentType {
    const hasText = plainText.length > 0;
    const hasImages = imageLength >= 1;

    if (!hasText && !hasImages) return ContentType.UNSUPPORTED;
    if (hasText && !hasImages) return ContentType.TEXT;
    if (!hasText && hasImages) return ContentType.IMAGE;
    if (hasText && hasImages) return ContentType.MIXED;
    return ContentType.UNSUPPORTED;
}

