import { ChatTemplate } from "@/lib/types/runtime";

export const gameForgeTemplates: ChatTemplate[] = [
  {
    id: "game-mobile-runner",
    serviceId: "game-forge",
    title: "Mobile Runner",
    desc: "Endless runner game design",
    tags: ["mobile", "runner", "casual"],
    prompt: "Design a mobile endless runner game. Include: Core loop, controls, progression system, monetization (ads + IAP), art direction, technical requirements.",
    params: { gameType: "2d", genre: "platformer" },
  },
  {
    id: "game-puzzle-match",
    serviceId: "game-forge",
    title: "Puzzle Match Game",
    desc: "Match-3 style puzzle game",
    tags: ["puzzle", "match3", "mobile"],
    prompt: "Design a puzzle match-3 game. Include: Game mechanics, level progression, power-ups, social features, monetization strategy, retention mechanics.",
    params: { gameType: "2d", genre: "puzzle" },
  },
  {
    id: "game-rpg-story",
    serviceId: "game-forge",
    title: "Story RPG",
    desc: "Narrative-driven RPG",
    tags: ["rpg", "story", "narrative"],
    prompt: "Design a story-driven RPG game. Include: Story outline, character progression, combat system, dialogue system, quest structure, world design.",
    params: { gameType: "2d", genre: "rpg" },
  },
];
