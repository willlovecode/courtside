const specialLetters: Record<string, string> = {
  ł: "l",
  Ł: "L",
  đ: "d",
  Đ: "D",
  ø: "o",
  Ø: "O",
  ß: "ss",
  ı: "i",
};

/** Lowercase ASCII slug for URLs: "Ślepsk Suwałki" becomes "slepsk-suwalki". */
export function slugify(text: string): string {
  return text
    .replace(/[łŁđĐøØßı]/g, (c) => specialLetters[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
