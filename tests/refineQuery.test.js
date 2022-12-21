import {tokenize} from "../src/index";

test("Removes shit numbers from the beginning of a filename", () => {
    const tokenizedString = tokenize("201112 Spider-Island - Heroes for Hire 001");
    console.log(tokenizedString);
    expect(tokenizedString.comicbook_identifier_tokens.inputString.trim()).toEqual("Spider-Island");
    expect(tokenizedString.comicbook_identifier_tokens.parsedIssueNumber).toEqual(1);
    expect(tokenizedString.comicbook_identifier_tokens.subtitle.trim()).toEqual("Heroes for Hire");
});