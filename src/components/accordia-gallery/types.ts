export interface CardData {
	id: string;
	title: string;
	description: string;
	hexColor: string;
	category: string;
	accentColor: string;
}

export interface GeneratedContentResponse {
	cards: CardData[];
}
