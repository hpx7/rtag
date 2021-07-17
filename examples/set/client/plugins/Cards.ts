import { Card, Color, Count, Shading, Shape, } from "../.rtag/types";
import { LitElement, html, property, css } from "lit-element";

export default class Cards extends LitElement {
  @property() val!: Card[];

  render() {
    console.log(this.val);

    return html`
      <div>
        <ul style="background: white">
          ${this.cards()}
        <ul/>
      </div>
      `;
  }

  cards() {
    return this.val.map((card, i) => {
      return html` <li>${i} : ${this.card(card)}</li> `;
    });
  }

  card(card: Card) {
    // color + count determine style

    // count + shape determine contents

    let baseSymbol = this.baseSymbol(card);
    let repeated = this.count(baseSymbol, card);

    console.log(repeated);

    return html`<b class="${Color[card.color]}${Shading[card.shading]}"> ${repeated} </b>`;
  }

  baseSymbol(card: Card) {
    switch (card.shape) {
      case Shape.SQUIGGLE: {
        return "S";
      }
      case Shape.OVAL: {
        return "⬬";
      }
      case Shape.DIAMOND: {
        return "◆";
      }
    }
  }

  count(baseSymbol: string, card: Card) {
    switch (card.count) {
      case Count.ONE: {
        return baseSymbol;
      }
      case Count.TWO: {
        return baseSymbol.repeat(2);
      }
      case Count.THREE: {
        return baseSymbol.repeat(3);
      }
    }
  }

  static get styles() {
    return css`
      .REDEMPTY {
        -webkit-text-stroke-width: 3px;
        -webkit-text-stroke-color: red;
        -webkit-text-fill-color: rgba(0, 0, 0, 0);
      }
      .REDPARTIAL {
        background: -webkit-linear-gradient(
          red,
          white,
          red,
          white,
          red,
          white,
          red,
          white,
          red,
          white,
          red,
          white,
          red,
          white,
          red,
          white,
          red,
          white
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .REDFULL {
        color: red;
      }
      .GREENEMPTY {
        -webkit-text-stroke-width: 3px;
        -webkit-text-stroke-color: green;
        -webkit-text-fill-color: rgba(0, 0, 0, 0);
      }
      .GREENPARTIAL {
        background: -webkit-linear-gradient(
          green,
          white,
          green,
          white,
          green,
          white,
          green,
          white,
          green,
          white,
          green,
          white,
          green,
          white,
          green,
          white,
          green,
          white
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .GREENFULL {
        color: green;
      }
      .PURPLEEMPTY {
        -webkit-text-stroke-width: 3px;
        -webkit-text-stroke-color: purple;
        -webkit-text-fill-color: rgba(0, 0, 0, 0);
      }
      .PURPLEPARTIAL {
        background: -webkit-linear-gradient(
          purple,
          white,
          purple,
          white,
          purple,
          white,
          purple,
          white,
          purple,
          white,
          purple,
          white,
          purple,
          white,
          purple,
          white,
          purple,
          white
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .PURPLEFULL {
        color: purple;
      }
    `;
  }
}
