/** Placeholder senders type in a wish; it becomes the recipient's name on the gift page. */
export const NAME_TOKEN = '{ten}';

export const WISH_LIMITS = { letterWish: 600, gardenWish: 200 };

export const DEFAULT_WISHES = {
  letterWish: 'Hôm nay là ngày của {ten}, nên được quyền nhõng nhẽo cả ngày nha. '
    + 'Chúc {ten} luôn vui, luôn xinh và bình yên theo cách của riêng mình. '
    + 'Chuyện mệt mỏi cứ để mai tính, hôm nay chỉ cần nhận hoa thôi 🌷',
  gardenWish: 'Bó hoa này chỉ có một, và nó là của {ten}.',
};

export const fillName = (template, name) => template.replaceAll(NAME_TOKEN, name);
