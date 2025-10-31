export type Point = { x: number; y: number };

export type Lens = {
	centerPx: Point;
	radiusPx: number;
	featherPx: number;
};

export type CommonUniforms = {
	resolution: Point;
	phase: number;
	amplitude: number;
	frequency: number;
	lens: Lens;
	offset?: Point;
};

export type Renderable<T> = {
	config: T; // mutable configuration (tweenable)
	updateConfig: (patch: Partial<T>) => void;
	resize: (args: { width: number; height: number }) => void;
	render: (uniforms: CommonUniforms) => void;
	dispose: () => void;
};

export type UniformsNames =
	| "u_resolution"
	| "u_phase"
	| "u_amplitude"
	| "u_frequency"
	| "u_color"
	| "u_lensCenterPx"
	| "u_lensRadiusPx"
	| "u_lensFeatherPx"
	| "u_lensMode"
	| "u_offset"
	| "u_texFill"
	| "u_texStroke"
	| "u_strengthPx"
	| "u_parallax"
	| "u_minSizePx"
	| "u_maxSizePx"
	| "u_alphaMin"
	| "u_alphaMax"
	| "u_depthBias"
	| "u_dashEnabled"
	| "u_dashPeriodPx"
	| "u_dashDuty"
	| "u_baseAlpha"
	| "u_centerPx"
	| "u_radiusPx"
	| "u_featherPx"
	| "u_colorFill"
	| "u_colorRing"
	| "u_textColor"
	| "u_hatchAngleDeg"
	| "u_hatchPeriodPx"
	| "u_hatchAlpha"
	| "u_hatchDuty"
	| "u_outlineAlpha"
	| "u_sparklesColor";
