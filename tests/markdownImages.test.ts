import assert from "node:assert/strict";
import {
  assetsFolderName,
  encodeImageSrc,
  findMarkdownImages,
  isLocalImageSrc,
  parseDataImageUrl,
  pastedImageFileName,
  replaceImageSources,
  resolveImagePath,
} from "../src/utils/markdownImages";
import { test } from "./testHarness";

// Pasting a picture used to write it into the text as a base64 data: URL,
// tens of thousands of characters long. Images now live as files in
// `<document>.assets/`, linked by relative path.

test("finds images with alt text, src and title", () => {
  const images = findMarkdownImages('a ![Chart](img/a.png "Q4") b ![](b.jpg)');

  assert.deepEqual(
    images.map(({ alt, src, title }) => ({ alt, src, title })),
    [
      { alt: "Chart", src: "img/a.png", title: "Q4" },
      { alt: "", src: "b.jpg", title: "" },
    ],
  );
});

test("reads a src in angle brackets, the form for paths with spaces", () => {
  assert.equal(findMarkdownImages("![](<my doc.assets/a b.png>)")[0]?.src, "my doc.assets/a b.png");
});

test("finds a base64 data: image", () => {
  const images = findMarkdownImages("![](data:image/png;base64,iVBORw0K+/=)");

  assert.equal(images[0]?.src, "data:image/png;base64,iVBORw0K+/=");
});

test("leaves image syntax inside code alone", () => {
  const markdown = "```\n![](a.png)\n```\n\n`![](b.png)` and ![](c.png)";

  assert.deepEqual(findMarkdownImages(markdown).map((image) => image.src), ["c.png"]);
});

test("ignores an escaped image and a plain link", () => {
  assert.deepEqual(findMarkdownImages("\\![](a.png) [x](b.png)"), []);
});

test("replacing a src keeps alt text, title and surrounding text", () => {
  const markdown = 'before ![Alt](data:image/png;base64,AAAA "T") after';
  const [image] = findMarkdownImages(markdown);

  assert.equal(
    replaceImageSources(markdown, [{ image: image!, src: "notes.assets/x.png" }]),
    'before ![Alt](notes.assets/x.png "T") after',
  );
});

test("replaces several images without shifting the later ones", () => {
  const markdown = "![](data:image/png;base64,AAAA)\n\n![](data:image/png;base64,BBBBBBBB)";
  const images = findMarkdownImages(markdown);

  assert.equal(
    replaceImageSources(markdown, images.map((image, index) => ({ image, src: `${index}.png` }))),
    "![](0.png)\n\n![](1.png)",
  );
});

test("local image sources", () => {
  assert.equal(isLocalImageSrc("notes.assets/a.png"), true);
  assert.equal(isLocalImageSrc("../a.png"), true);
  assert.equal(isLocalImageSrc("/Users/nata/a.png"), true);
  assert.equal(isLocalImageSrc("file:///Users/nata/a.png"), true);
  assert.equal(isLocalImageSrc("C:\\pics\\a.png"), true);
  assert.equal(isLocalImageSrc("https://example.com/a.png"), false);
  assert.equal(isLocalImageSrc("data:image/png;base64,AAAA"), false);
  assert.equal(isLocalImageSrc("//cdn.example.com/a.png"), false);
});

test("a relative src is read against the document's folder", () => {
  assert.equal(
    resolveImagePath("image-md.assets/tensions.png", "/Users/nata/Downloads/image-md.md"),
    "/Users/nata/Downloads/image-md.assets/tensions.png",
  );
  assert.equal(resolveImagePath("../pics/a.png", "/Users/nata/docs/n.md"), "/Users/nata/pics/a.png");
  assert.equal(resolveImagePath("./a%20b.png", "/Users/nata/n.md"), "/Users/nata/a b.png");
});

test("a relative src has nowhere to point in an Untitled document", () => {
  assert.equal(resolveImagePath("a.png", null), null);
});

test("absolute and file: sources resolve to themselves", () => {
  assert.equal(resolveImagePath("/tmp/a.png", null), "/tmp/a.png");
  assert.equal(resolveImagePath("file:///tmp/a%20b.png", null), "/tmp/a b.png");
});

test("Windows paths keep their backslashes", () => {
  assert.equal(
    resolveImagePath("notes.assets/a.png", "C:\\Users\\nata\\notes.md"),
    "C:\\Users\\nata\\notes.assets\\a.png",
  );
});

test("the images folder is named after the document", () => {
  assert.equal(assetsFolderName("/Users/nata/My notes.md"), "My notes.assets");
  assert.equal(assetsFolderName("C:\\docs\\plan.markdown"), "plan.assets");
});

test("spaces and brackets in a written link are percent-encoded", () => {
  assert.equal(encodeImageSrc("My notes.assets/a (1).png"), "My%20notes.assets/a%20%281%29.png");
  assert.equal(
    resolveImagePath(encodeImageSrc("My notes.assets/a (1).png"), "/d/My notes.md"),
    "/d/My notes.assets/a (1).png",
  );
});

test("parses a data: image into type, extension and bytes", () => {
  assert.deepEqual(parseDataImageUrl("data:image/jpeg;base64,/9j/4A=="), {
    mime: "image/jpeg",
    extension: "jpg",
    base64: "/9j/4A==",
  });
  assert.equal(parseDataImageUrl("data:text/plain;base64,AAAA"), null);
  assert.equal(parseDataImageUrl("data:image/png,raw"), null);
});

test("a pasted image is named by when it was added", () => {
  assert.equal(pastedImageFileName(new Date(2026, 10, 24, 9, 5, 7), "png"), "image-20261124-090507.png");
});
