import { Methods } from "./.rtag/methods";
import { AnonymousUserData, ICreateGameRequest, IUpdateNameRequest, PlayerState } from "./.rtag/types";


interface InternalState {
    name: string;
}

export class Impl implements Methods<InternalState> {
    updateName(state: InternalState, user: AnonymousUserData, request: IUpdateNameRequest): string | void {
        state.name = request.name;
    }
    createGame(user: any, request: ICreateGameRequest): InternalState {
        return {
            name: `John`
        };
    }
    getUserState(state: InternalState, user: any): PlayerState {
        return {
            text: `Hello ${state.name}`
        }
    }

}