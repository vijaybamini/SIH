/* ---------------------------------------------------------------------------
 * Bulk buyer catalog (frontend prototype)
 * ---------------------------------------------------------------------------
 * This file mirrors the shape of a future `buyer_products` Supabase table.
 * Columns map 1:1 to a Supabase row so the swap later is a one-line change.
 *
 *   category  -> category key (fk)      pricePerKg -> numeric column
 *   name      -> product name column    image      -> image_url column
 *   unit      -> unit column ('kg' today, 'bag'/'quintal' later)
 *   origin    -> where the produce hails from
 *   rating    -> seller rating stored as numeric(2,1)
 *   favorited / minOrderKg -> buyer-specific helpers (future DB columns)
 *
 * Images are Wikimedia Commons thumbnails. The <img> has an onError fallback
 * to a category emoji tile, so a missing/broken URL never breaks the layout.
 * -------------------------------------------------------------------------*/

export const buyerCategories = [
  { id: 'rice', icon: '🌾', accent: '#f0a010' },
  { id: 'wheat', icon: '🌾', accent: '#c8a24a' },
  { id: 'cereals', icon: '🥣', accent: '#b07830' },
  { id: 'oils', icon: '🛢️', accent: '#8a8f3a' },
  { id: 'vegetables', icon: '🥕', accent: '#3f9b3f' },
  { id: 'fruits', icon: '🍎', accent: '#d8452f' },
]

export const buyerProducts = [
  /* ---- Rice ---- */
  { id: 'r-basmati', name: 'Basmati Rice', category: 'rice', pricePerKg: 168, unit: 'kg', origin: 'Punjab', rating: 4.8, minOrderKg: 25, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Grano_de_arroz_basmati_integral%2C_2020-06-12%2C_DD_01-11_FS.jpg/500px-Grano_de_arroz_basmati_integral%2C_2020-06-12%2C_DD_01-11_FS.jpg' },
  { id: 'r-sona', name: 'Sona Masoori Rice', category: 'rice', pricePerKg: 82, unit: 'kg', origin: 'Andhra Pradesh', rating: 4.7, minOrderKg: 25, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Masoori_Rice_%285193854729%29.jpg/500px-Masoori_Rice_%285193854729%29.jpg' },
  { id: 'r-jasmine', name: 'Jasmine Rice', category: 'rice', pricePerKg: 135, unit: 'kg', origin: 'Kerala', rating: 4.5, minOrderKg: 20, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Thai_jasmine_rice_uncooked.jpg/500px-Thai_jasmine_rice_uncooked.jpg' },
  { id: 'r-ponni', name: 'Ponni Rice', category: 'rice', pricePerKg: 95, unit: 'kg', origin: 'Tamil Nadu', rating: 4.6, minOrderKg: 25, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/A_bag_of_Ponni_rice.JPG/500px-A_bag_of_Ponni_rice.JPG' },
  { id: 'r-brown', name: 'Brown Rice', category: 'rice', pricePerKg: 145, unit: 'kg', origin: 'Karnataka', rating: 4.7, minOrderKg: 15, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Buying_some_brown_rice_with_our_own_bag_at_The_Captain_Pig.jpg/500px-Buying_some_brown_rice_with_our_own_bag_at_The_Captain_Pig.jpg' },
  { id: 'r-white', name: 'White Rice', category: 'rice', pricePerKg: 88, unit: 'kg', origin: 'Uttar Pradesh', rating: 4.4, minOrderKg: 30, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/White_rice_at_a_restaurant.jpg/500px-White_rice_at_a_restaurant.jpg' },
  { id: 'r-idli', name: 'Idli Rice', category: 'rice', pricePerKg: 92, unit: 'kg', origin: 'Tamil Nadu', rating: 4.7, minOrderKg: 20, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Idli.jpg/500px-Idli.jpg' },
  { id: 'r-biryani', name: 'Biryani Rava', category: 'rice', pricePerKg: 118, unit: 'kg', origin: 'Andhra Pradesh', rating: 4.5, minOrderKg: 20, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Dum_Biryani_Plate.jpg/500px-Dum_Biryani_Plate.jpg' },

  /* ---- Wheat ---- */
  { id: 'w-grains', name: 'Wheat Grains', category: 'wheat', pricePerKg: 44, unit: 'kg', origin: 'Madhya Pradesh', rating: 4.5, minOrderKg: 40, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Wheat_close-up.JPG/500px-Wheat_close-up.JPG' },
  { id: 'w-flour', name: 'Whole Wheatt Flour', category: 'wheat', pricePerKg: 52, unit: 'kg', origin: 'Punjab', rating: 4.6, minOrderKg: 30, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Whole_wheat_grain_flour_being_scooped.jpg/500px-Whole_wheat_grain_flour_being_scooped.jpg' },
  { id: 'w-durum', name: 'Durum Wheat (Suji)', category: 'wheat', pricePerKg: 61, unit: 'kg', origin: 'Rajasthan', rating: 4.4, minOrderKg: 40, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Triticum-durum-ear.JPG/500px-Triticum-durum-ear.JPG' },
  { id: 'w-ban', name: 'Wheat Bran', category: 'wheat', pricePerKg: 18, unit: 'kg', origin: 'Haryana', rating: 4.2, minOrderKg: 50, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Whole_wheat_grain_flour_being_scooped.jpg/500px-Whole_wheat_grain_flour_being_scooped.jpg' },

  /* ---- Cereals & Millets ---- */
  { id: 'c-oats', name: 'Rolled Oats', category: 'cereals', pricePerKg: 132, unit: 'kg', origin: 'Uttarakhand', rating: 4.6, minOrderKg: 15, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Rolled_oats.jpg/500px-Rolled_oats.jpg' },
  { id: 'c-maize', name: 'Maize (Corn)', category: 'cereals', pricePerKg: 46, unit: 'kg', origin: 'Karnataka', rating: 4.5, minOrderKg: 50, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Corn_kernels.jpg/500px-Corn_kernels.jpg' },
  { id: 'c-bajra', name: 'Pearl Millet (Bajra)', category: 'cereals', pricePerKg: 62, unit: 'kg', origin: 'Rajasthan', rating: 4.7, minOrderKg: 25, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Grain_millet%2C_early_grain_fill%2C_Tifton%2C_7-3-02.jpg/500px-Grain_millet%2C_early_grain_fill%2C_Tifton%2C_7-3-02.jpg' },
  { id: 'c-jowar', name: 'Sorghum (Jowar)', category: 'cereals', pricePerKg: 58, unit: 'kg', origin: 'Maharashtra', rating: 4.5, minOrderKg: 25, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Jowar_Sorghum.JPG/500px-Jowar_Sorghum.JPG' },
  { id: 'c-ragi', name: 'Finger Millet (Ragi)', category: 'cereals', pricePerKg: 118, unit: 'kg', origin: 'Karnataka', rating: 4.8, minOrderKg: 15, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Ragi_Idli_%28Finger_Millet%29_with_Sambar.jpg/500px-Ragi_Idli_%28Finger_Millet%29_with_Sambar.jpg' },
  { id: 'c-barley', name: 'Barley', category: 'cereals', pricePerKg: 55, unit: 'kg', origin: 'Uttar Pradesh', rating: 4.5, minOrderKg: 30, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Barley_in_Slovenia.jpg/500px-Barley_in_Slovenia.jpg' },

  /* ---- Oils ---- */
  { id: 'o-groundnut', name: 'Groundnut Oil', category: 'oils', pricePerKg: 178, unit: 'L', origin: 'Gujarat', rating: 4.7, minOrderKg: 10, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Peanut_oil_bottle.jpg/500px-Peanut_oil_bottle.jpg' },
  { id: 'o-sunflower', name: 'Sunflower Oil', category: 'oils', pricePerKg: 152, unit: 'L', origin: 'Karnataka', rating: 4.5, minOrderKg: 10, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Sunflower_oil_and_sunflower.jpg/500px-Sunflower_oil_and_sunflower.jpg' },
  { id: 'o-soybean', name: 'Soybean Oil', category: 'oils', pricePerKg: 146, unit: 'L', origin: 'Madhya Pradesh', rating: 4.4, minOrderKg: 10, image: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Bequer-B100-SOJA-SOYBEAM.jpg' },
  { id: 'o-mustard', name: 'Mustard Oil', category: 'oils', pricePerKg: 164, unit: 'L', origin: 'Rajasthan', rating: 4.8, minOrderKg: 10, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Mustard_Oil_%26_Seeds_-_Kolkata_2003-10-31_00537.JPG/500px-Mustard_Oil_%26_Seeds_-_Kolkata_2003-10-31_00537.JPG' },
  { id: 'o-coconut', name: 'Coconut Oil', category: 'oils', pricePerKg: 252, unit: 'L', origin: 'Kerala', rating: 4.7, minOrderKg: 5, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Coconut_oil_2.jpg/500px-Coconut_oil_2.jpg' },
  { id: 'o-sesame', name: 'Sesame Oil', category: 'oils', pricePerKg: 232, unit: 'L', origin: 'Tamil Nadu', rating: 4.6, minOrderKg: 5, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Sesame_oil.jpg/500px-Sesame_oil.jpg' },

  /* ---- Vegetables ---- */
  { id: 'v-onion', name: 'Onion', category: 'vegetables', pricePerKg: 58, unit: 'kg', origin: 'Maharashtra', rating: 4.5, minOrderKg: 20, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Mixed_onions.jpg/500px-Mixed_onions.jpg' },
  { id: 'v-potato', name: 'Potato', category: 'vegetables', pricePerKg: 42, unit: 'kg', origin: 'Uttar Pradesh', rating: 4.3, minOrderKg: 25, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Gyudon%2C_potato_salad_and_raw_egg_by_jetalone_in_Ochanomizu%2C_Tokyo.jpg/500px-Gyudon%2C_potato_salad_and_raw_egg_by_jetalone_in_Ochanomizu%2C_Tokyo.jpg' },
  { id: 'v-tomato', name: 'Tomato', category: 'vegetables', pricePerKg: 52, unit: 'kg', origin: 'Andhra Pradesh', rating: 4.1, minOrderKg: 20, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tomato_je.jpg/500px-Tomato_je.jpg' },
  { id: 'v-carrot', name: 'Carrot', category: 'vegetables', pricePerKg: 96, unit: 'kg', origin: 'Himachal Pradesh', rating: 4.6, minOrderKg: 15, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Carrots_of_many_colors.jpg/500px-Carrots_of_many_colors.jpg' },
  { id: 'v-cauli', name: 'Cauliflower', category: 'vegetables', pricePerKg: 66, unit: 'kg', origin: 'Punjab', rating: 4.3, minOrderKg: 20, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Starr_080103-1275_Brassica_oleracea_var._botrytis.jpg/500px-Starr_080103-1275_Brassica_oleracea_var._botrytis.jpg' },
  { id: 'v-cabbage', name: 'Cabbage', category: 'vegetables', pricePerKg: 48, unit: 'kg', origin: 'Karnataka', rating: 4.2, minOrderKg: 20, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/White_cabbage_garden.jpg/500px-White_cabbage_garden.jpg' },
  { id: 'v-broccoli', name: 'Broccoli', category: 'vegetables', pricePerKg: 128, unit: 'kg', origin: 'Himachal Pradesh', rating: 4.4, minOrderKg: 10, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Broccoli_and_cross_section_edit.jpg/500px-Broccoli_and_cross_section_edit.jpg' },
  { id: 'v-spinach', name: 'Spinach', category: 'vegetables', pricePerKg: 58, unit: 'kg', origin: 'Telangana', rating: 4.3, minOrderKg: 10, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Spinach_leaves.jpg/500px-Spinach_leaves.jpg' },

  /* ---- Fruits ---- */
  { id: 'f-mango', name: 'Mango (Alphonso)', category: 'fruits', pricePerKg: 195, unit: 'kg', origin: 'Maharashtra', rating: 4.9, minOrderKg: 10, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Mangos_-_single_and_halved.jpg/500px-Mangos_-_single_and_halved.jpg' },
  { id: 'f-banana', name: 'Banana', category: 'fruits', pricePerKg: 42, unit: 'kg', origin: 'Tamil Nadu', rating: 4.6, minOrderKg: 40, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Cavendish_banana_from_Maracaibo.jpg/500px-Cavendish_banana_from_Maracaibo.jpg' },
  { id: 'f-apple', name: 'Apple (Kashmir)', category: 'fruits', pricePerKg: 168, unit: 'kg', origin: 'Jammu & Kashmir', rating: 4.7, minOrderKg: 15, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Red_Apple.jpg/500px-Red_Apple.jpg' },
  { id: 'f-orange', name: 'Orange (Nagpur)', category: 'fruits', pricePerKg: 74, unit: 'kg', origin: 'Maharashtra', rating: 4.4, minOrderKg: 20, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Ambersweet_oranges.jpg/500px-Ambersweet_oranges.jpg' },
  { id: 'f-pomegranate', name: 'Pomegranate', category: 'fruits', pricePerKg: 158, unit: 'kg', origin: 'Maharashtra', rating: 4.8, minOrderKg: 15, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Pomegranate02_edit.jpg/500px-Pomegranate02_edit.jpg' },
  { id: 'f-grapes', name: 'Grapes', category: 'fruits', pricePerKg: 120, unit: 'kg', origin: 'Maharashtra', rating: 4.6, minOrderKg: 10, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Close_up_grapes.jpg/500px-Close_up_grapes.jpg' },
  { id: 'f-watermelon', name: 'Watermelon', category: 'fruits', pricePerKg: 44, unit: 'kg', origin: 'Andhra Pradesh', rating: 4.3, minOrderKg: 30, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Taiwan_2009_Tainan_City_Organic_Farm_Watermelon_FRD_7962.jpg/500px-Taiwan_2009_Tainan_City_Organic_Farm_Watermelon_FRD_7962.jpg' },
  { id: 'f-papaya', name: 'Papaya', category: 'fruits', pricePerKg: 66, unit: 'kg', origin: 'Karnataka', rating: 4.5, minOrderKg: 15, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Papaya_fruit_-_Fruit_%2815751942232%29.jpg/500px-Papaya_fruit_-_Fruit_%2815751942232%29.jpg' },
]
