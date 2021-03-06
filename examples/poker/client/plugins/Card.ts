import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { Card } from "../.rtag/types";
import "playing-card";

const rankConversion: Record<string, string> = {
  Two: "2",
  Three: "3",
  Four: "4",
  Five: "5",
  Six: "6",
  Seven: "7",
  Eight: "8",
  Nine: "9",
  Ten: "10",
  Jack: "J",
  Queen: "Q",
  King: "K",
  Ace: "A",
};

export default class CardComponent extends LitElement {
  @property()
  val: Card | undefined;

  render() {
    return html`<playing-card rank="${rankConversion[this.val!.rank]}" suit="${this.val!.suit[0]}"></playing-card>`;
  }
}
