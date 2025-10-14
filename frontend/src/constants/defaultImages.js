const DEFAULT_LISTING_IMAGES = {
    sale: '/default-images/sale.jpg',
    acquire: '/default-images/acquire.jpg',
    help: '/default-images/help.jpg',
    lostfound: '/default-images/lostfound.jpg',
};

const FALLBACK_IMAGE = 'https://via.placeholder.com/400x300?text=YuYuanYiZhan';

export const getDefaultListingImage = (type) => {
    if (!type) {
        return DEFAULT_LISTING_IMAGES.sale;
    }
    return DEFAULT_LISTING_IMAGES[type] || FALLBACK_IMAGE;
};

export const getDefaultDetailImage = (type) => {
    return getDefaultListingImage(type);
};

export { DEFAULT_LISTING_IMAGES, FALLBACK_IMAGE };
