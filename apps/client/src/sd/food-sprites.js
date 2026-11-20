// HD sheets contain three square consumption frames. Keep their shared grip
// instead of trimming each frame, so a bite never shifts the food in the hand.
export async function loadFoodSprites(THREE, ids) {
  const loader = new THREE.TextureLoader();
  const sheets = new Map(await Promise.all([...ids].map(async (id) => {
    const texture = await loader.loadAsync(`/sprites/food-hd/${id}.png`);
    const image = texture.image;
    texture.dispose(); // Only the cropped frames will be uploaded to the GPU.
    if (image.width !== 384 || image.height !== 128) throw new Error(`Invalid food sheet: ${id}`);
    return [id, image];
  })));
  const materials = new Map();
  return function buildFood(id, stage) {
    const key = `${id}:${stage}`;
    if (!materials.has(key)) {
      const image = sheets.get(id);
      if (!image || !Number.isInteger(stage) || stage < 0 || stage > 2) throw new Error(`Invalid food frame: ${key}`);
      // Separate canvases avoid atlas-edge bleeding when the camera zooms out.
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      canvas.getContext("2d").drawImage(image, stage * 128, 0, 128, 128, 0, 0, 128, 128);
      const map = new THREE.CanvasTexture(canvas);
      map.encoding = THREE.LinearEncoding; // Same color handling as the dolls.
      map.magFilter = THREE.LinearFilter;
      materials.set(key, new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false }));
    }
    const sprite = new THREE.Sprite(materials.get(key));
    sprite.name = `food-${key}`;
    sprite.center.set(0.5, 0.25); // Source grip (6,9) in a 12×12 frame; Y is up.
    sprite.scale.set(0.36, 0.36, 1);
    return sprite;
  };
}
