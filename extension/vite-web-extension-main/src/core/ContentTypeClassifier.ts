// put imports here soon
import { ContentType } from "@src/types/domain";

export class ContentTypeClassifier {
    // determines contentType for a certain post
    // available options are text, image, mixed, unsupported.
    // ContentType is a string enum
    classify(plainText: string, imageLength: number): ContentType {
        // need to debug with the plainText field and see what an image post usually returns.
        // not sure if this logic is correct until i see a real plainText field for an image post
        // e.g. where does the post's title go?
        if (plainText === null && imageLength < 1) return ContentType.UNSUPPORTED;
        if (plainText !== null && imageLength < 1) return ContentType.TEXT;
        if (plainText === null && imageLength >= 1) return ContentType.IMAGE;
        if (plainText !== null && imageLength >= 1) return ContentType.MIXED;
        return ContentType.UNSUPPORTED;
    }
}