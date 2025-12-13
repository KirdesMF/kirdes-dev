import CSSIcon from "../icons/CSSIcon.astro";
import DrizzleIcon from "../icons/DrizzleIcon.astro";
import GitIcon from "../icons/GitIcon.astro";
import GSAPIcon from "../icons/GSAPIcon.astro";
import HonoIcon from "../icons/HonoIcon.astro";
import HTMLIcon from "../icons/HTMLIcon.astro";
import JavaScriptIcon from "../icons/JavaScriptIcon.astro";
import NextJSIcon from "../icons/NextJSIcon.astro";
import NodeIcon from "../icons/NodeIcon.astro";
import PostgreSQLIcon from "../icons/PostgreSQLIcon.astro";
import ReactIcon from "../icons/ReactIcon.astro";
import RiveIcon from "../icons/RiveIcon.astro";
import ShadcnIcon from "../icons/ShadcnIcon.astro";
import SVGIcon from "../icons/SVGIcon.astro";
import TailwindIcon from "../icons/TailwindIcon.astro";
import TanstackIcon from "../icons/TanstackIcon.astro";
import TypeScriptIcon from "../icons/TypeScriptIcon.astro";
import ViteIcon from "../icons/ViteIcon.astro";
import WebGLIcon from "../icons/WebGLIcon.astro";
import ZodIcon from "../icons/ZodIcon.astro";

export type TechIcon = typeof HTMLIcon;

export interface TechItem {
	id: string;
	name: string;
	color: string;
	Icon: TechIcon;
}

export const techStack: TechItem[] = [
	{ id: "html", name: "HTML", color: "#000000", Icon: HTMLIcon },
	{ id: "css", name: "CSS", color: "#000000", Icon: CSSIcon },
	{ id: "javascript", name: "JavaScript", color: "#000000", Icon: JavaScriptIcon },
	{ id: "typescript", name: "TypeScript", color: "#000000", Icon: TypeScriptIcon },
	{ id: "git", name: "Git", color: "#000000", Icon: GitIcon },
	{ id: "react", name: "React", color: "#000000", Icon: ReactIcon },
	{ id: "node", name: "Node.js", color: "#000000", Icon: NodeIcon },
	{ id: "next", name: "Next.js", color: "#000000", Icon: NextJSIcon },
	{ id: "tailwind", name: "Tailwind", color: "#000000", Icon: TailwindIcon },
	{ id: "vite", name: "Vite", color: "#000000", Icon: ViteIcon },
	{ id: "tanstack", name: "TanStack", color: "#000000", Icon: TanstackIcon },
	{ id: "postgres", name: "PostgreSQL", color: "#000000", Icon: PostgreSQLIcon },
	{ id: "drizzle", name: "Drizzle", color: "#000000", Icon: DrizzleIcon },
	{ id: "zod", name: "Zod", color: "#000000", Icon: ZodIcon },
	{ id: "hono", name: "Hono", color: "#000000", Icon: HonoIcon },
	{ id: "gsap", name: "GSAP", color: "#000000", Icon: GSAPIcon },
	{ id: "shadcn", name: "shadcn/ui", color: "#000000", Icon: ShadcnIcon },
	{ id: "rive", name: "Rive", color: "#000000", Icon: RiveIcon },
	{ id: "svg", name: "SVG", color: "#000000", Icon: SVGIcon },
	{ id: "webgl", name: "WebGL", color: "#000000", Icon: WebGLIcon },
];
