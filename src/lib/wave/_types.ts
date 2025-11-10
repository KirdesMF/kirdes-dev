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
	| "u_ampEnvelope"
	| "u_baselineSlope"
	| "u_offset"
	| "u_areaSize"
	| "u_time"
	| "u_direction"
	| "u_depthWaveNear"
	| "u_depthWaveFar"
	| "u_depthAlphaNear"
	| "u_depthAlphaFar"
	| "u_color"
	| "u_baseAlpha"
	| "u_outlineWidth"
	| "u_lensCenterPx"
	| "u_lensRadiusPx"
	| "u_lensFeatherPx"
	| "u_dashEnabled"
	| "u_dashPeriodPx"
	| "u_dashDuty"
	| "u_dashAngleDeg"
	| "u_sprite"
	| "u_fillColor"
	| "u_outlineColor"
	| "u_dualOffsetX"
	| "u_shadowOffset"
	| "u_shadowMode"
	| "u_texFill"
	| "u_texStroke"
	| "u_textColor"
	| "u_outlineAlpha"
	| "u_outlineBaseColor"
	| "u_outlineBaseAlpha"
	| "u_fillBgColor"
	| "u_hatchAngleDeg"
	| "u_hatchPeriodPx"
	| "u_hatchAlpha"
	| "u_hatchDuty"
	| "u_centerPx"
	| "u_radiusPx"
	| "u_featherPx"
	| "u_colorFill"
	| "u_colorRing";
