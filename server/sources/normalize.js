
/**
 * Chuyển dữ liệu thô từ tiktok-live-connector (v2, cũng chịu được định dạng v1 cũ)
 * thành sự kiện chuẩn hoá mà PrisonGame hiểu.
 */

function pickUrl(img) {
  if (!img) return null;
  if (typeof img === 'string') return img;
  const list = img.urlList || img.url || img.url_list;
  if (Array.isArray(list) && list.length) {
    // Ưu tiên ảnh jpeg/png (OBS đôi khi không hiện webp/heic)
    return list.find((u) => /\.(jpe?g|png)/i.test(u)) || list[0];
  }
  return null;
}

function normalizeUser(data) {
  const u = data.user || data;
  const uniqueId = u.uniqueId || u.displayId || data.uniqueId || '';
  const userId = String(u.userId || u.idStr || u.id || data.userId || '') || '';
  const nickname = u.nickname || data.nickname || uniqueId;
  const avatar =
    u.profilePictureUrl ||
    data.profilePictureUrl ||
    pickUrl(u.profilePicture) ||
    pickUrl(u.avatarThumb) ||
    pickUrl(u.avatarMedium) ||
    pickUrl(u.avatarLarge) ||
    null;
  const key = userId && userId !== '0' ? `u${userId}` : uniqueId ? `@${String(uniqueId).toLowerCase()}` : null;
  return { key, uniqueId, nickname, avatar };
}

function msgIdOf(data) {
  const id = data.common?.msgId || data.msgId;
  return id ? String(id) : undefined;
}

function normalizeChat(data) {
  return { type: 'chat', msgId: msgIdOf(data), user: normalizeUser(data), comment: data.comment || data.content || '' };
}

/** Trả về null nếu là quà đang trong chuỗi combo (chờ sự kiện kết thúc combo) */
function normalizeGift(data) {
  const details = data.giftDetails || data.gift || data.extendedGiftInfo || {};
  const giftType = details.giftType ?? details.type ?? data.giftType;
  const repeatEnd = !!data.repeatEnd;
  if (giftType === 1 && !repeatEnd) return null;
  return {
    type: 'gift',
    msgId: msgIdOf(data),
    user: normalizeUser(data),
    gift: {
      id: data.giftId ?? details.id,
      name: details.giftName || details.name || data.extendedGiftInfo?.name || data.giftName || '',
      diamonds: Number(details.diamondCount ?? details.diamond_count ?? data.extendedGiftInfo?.diamond_count ?? data.diamondCount) || 0,
      count: Number(data.repeatCount) || 1,
    },
  };
}

function normalizeLike(data) {
  return { type: 'like', msgId: msgIdOf(data), user: normalizeUser(data), likeCount: Number(data.likeCount ?? data.count) || 1 };
}

function normalizeFollow(data) {
  return { type: 'follow', msgId: msgIdOf(data), user: normalizeUser(data) };
}

export { normalizeChat, normalizeGift, normalizeLike, normalizeFollow, normalizeUser };
