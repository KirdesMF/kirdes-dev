// import { Application, Mesh, PlaneGeometry, Rectangle, Text, TextStyle, TilingSprite } from "pixi.js";
// import { events } from "../../lib/states";
// import { convertCssColorToRgbFloat } from "../../utils/colors";

// export class PortfolioTissue {
// 	private app: Application;
// 	private container: HTMLElement;
// 	private plane: Mesh | null = null;
// 	private text: Text | null = null;
// 	private tilingSprite: TilingSprite | null = null;
// 	private time: number = 0;
// 	private unsubscribeTheme: (() => void) | null = null;

// 	// Configuration
// 	public frequency: number;
// 	public amplitude: number;
// 	public speed: number;
// 	public rotation: number;
// 	private originalPositions: Float32Array | null = null;

// 	constructor(container: HTMLElement) {
// 		this.container = container;
// 		this.frequency = parseFloat(container.dataset.frequency || "0.5");
// 		this.amplitude = parseFloat(container.dataset.amplitude || "60");
// 		this.speed = parseFloat(container.dataset.speed || "0.1");
// 		this.rotation = parseFloat(container.dataset.rotation || "45");

// 		this.app = new Application();
// 		this.init();
// 	}

// 	async init() {
// 		await this.app.init({
// 			resizeTo: this.container,
// 			backgroundAlpha: 0, // Transparent background
// 			antialias: true,
// 			autoDensity: true,
// 			resolution: window.devicePixelRatio || 1,
// 		});

// 		this.container.appendChild(this.app.canvas);

// 		// Create the text texture
// 		const textStyle = new TextStyle({
// 			fontFamily: "Arial Black, Arial, sans-serif",
// 			fontSize: 80, // Larger text
// 			fontWeight: "900",
// 			fill: this.getColor(), // Initial color
// 			align: "center",
// 		});

// 		this.text = new Text({ text: "PORTFOLIO ", style: textStyle }); // Reduced spaces

// 		// Generate texture from text
// 		const textTexture = this.app.renderer.generateTexture(this.text);

// 		// Add padding to cover wave displacement at edges
// 		const padding = 100;
// 		const width = this.app.screen.width + padding * 2;
// 		const height = this.app.screen.height + padding * 2;

// 		this.tilingSprite = new TilingSprite({
// 			texture: textTexture,
// 			width: width,
// 			height: height,
// 		});

// 		// Rotate the pattern
// 		this.tilingSprite.tileRotation = -Math.PI / 4;
// 		this.tilingSprite.tileScale.set(0.8); // Adjust scale if needed

// 		// Render the tiling sprite to a texture
// 		const renderTexture = this.app.renderer.generateTexture({
// 			target: this.tilingSprite,
// 			resolution: 1,
// 			frame: new Rectangle(0, 0, width, height),
// 		});

// 		// Create the plane using Mesh and PlaneGeometry
// 		const geometry = new PlaneGeometry({
// 			width: width,
// 			height: height,
// 			verticesX: 60, // More vertices for smoother wave
// 			verticesY: 60,
// 		});

// 		this.plane = new Mesh({
// 			geometry: geometry,
// 			texture: renderTexture,
// 		});

// 		// Offset the plane to center the larger area
// 		this.plane.position.set(-padding, -padding);

// 		if (this.plane) {
// 			this.app.stage.addChild(this.plane);
// 		}

// 		this.app.ticker.add((ticker) => {
// 			this.update(ticker.deltaTime);
// 		});

// 		// Listen for theme changes
// 		this.unsubscribeTheme = events.onThemeChange(() => {
// 			this.updateColor();
// 		});
// 	}

// 	getColor(): number {
// 		// Get the color from CSS variable
// 		const style = getComputedStyle(document.documentElement);
// 		const colorStr = style.getPropertyValue("--color-foreground").trim();

// 		// Convert CSS color string (potentially oklch) to PixiJS hex
// 		try {
// 			const rgb = convertCssColorToRgbFloat(colorStr || "#000000");
// 			return rgbFloatToHex(rgb);
// 		} catch (e) {
// 			console.error("Failed to parse color:", colorStr, e);
// 			return 0x000000;
// 		}
// 	}

// 	async updateColor() {
// 		if (!this.text || !this.tilingSprite || !this.plane || !this.app.renderer) return;

// 		const newColor = this.getColor();
// 		this.text.style.fill = newColor;

// 		// Regenerate textures
// 		// Note: In a production app we should carefully manage texture memory (destroy old ones)

// 		const oldTextTexture = this.tilingSprite.texture;
// 		const newTextTexture = this.app.renderer.generateTexture(this.text);
// 		this.tilingSprite.texture = newTextTexture;

// 		// We need to re-render the tiling sprite to a new texture for the mesh
// 		const width = this.tilingSprite.width;
// 		const height = this.tilingSprite.height;

// 		const oldRenderTexture = this.plane.texture;
// 		const newRenderTexture = this.app.renderer.generateTexture({
// 			target: this.tilingSprite,
// 			resolution: 1,
// 			frame: new Rectangle(0, 0, width, height),
// 		});

// 		this.plane.texture = newRenderTexture;

// 		// Cleanup old textures to prevent memory leaks
// 		if (oldTextTexture && oldTextTexture !== newTextTexture) oldTextTexture.destroy();
// 		if (oldRenderTexture && oldRenderTexture !== newRenderTexture) oldRenderTexture.destroy();
// 	}

// 	update(delta: number) {
// 		if (!this.plane) return;

// 		this.time += this.speed * delta;

// 		// Access geometry and buffer
// 		const geometry = this.plane.geometry;
// 		const attribute = geometry.getAttribute("aPosition");
// 		const buffer = attribute.buffer;

// 		// Store original positions if not already done
// 		if (!this.originalPositions) {
// 			this.originalPositions = Float32Array.from(buffer.data as Float32Array);
// 		}

// 		const original = this.originalPositions;
// 		const data = buffer.data as Float32Array;

// 		for (let i = 0; i < data.length; i += 2) {
// 			const x = original[i];
// 			const y = original[i + 1];

// 			// Diagonal wave effect
// 			// We calculate a phase based on both x and y to make the wave travel diagonally
// 			const angle = this.rotation * (Math.PI / 180);
// 			const cos = Math.cos(angle);
// 			const sin = Math.sin(angle);
// 			const phase = (x * cos + y * sin) * this.frequency * 0.01 + this.time;

// 			// Calculate displacement
// 			// We displace perpendicular to the wave direction or just Z-ish mapped to Y
// 			// Let's try a "bulge" effect
// 			const offset = Math.sin(phase) * this.amplitude;

// 			// Apply offset.
// 			// For a "tissue" look, we might want to displace both X and Y slightly
// 			data[i] = x + offset * 0.5;
// 			data[i + 1] = y + offset * 0.5;
// 		}

// 		buffer.update();
// 	}

// 	destroy() {
// 		if (this.unsubscribeTheme) {
// 			this.unsubscribeTheme();
// 		}
// 		// v8 destroy options
// 		this.app.destroy({ removeView: true }, { children: true, texture: true });
// 	}
// }
