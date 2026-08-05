/**
 * The HQ / Kiambu outlet shares one single stock pool with the factory (FPS).
 * Stock only enters the pool through "Receive from production"; it leaves either
 * through a sale on the HQ shop account or through a delivery dispatch.
 */
export const HQ_SHOP_ID = 'kiambu_shop';

export const isHqShop = (shopId?: string | null) => (shopId || '') === HQ_SHOP_ID;