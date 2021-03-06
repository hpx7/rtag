import { Methods, Context, Result } from "./.rtag/methods";
import {
  UserData,
  PlayerState,
  ICreateGameRequest,
  IJoinGameRequest,
  IStartGameRequest,
  IProposeQuestRequest,
  IVoteForProposalRequest,
  IVoteInQuestRequest,
  Username,
  Role,
  Vote,
  GameStatus,
  QuestAttempt,
  QuestStatus,
} from "./.rtag/types";
import { shuffle } from "./utils";

interface InternalQuestAttempt {
  roundNumber: number;
  attemptNumber: number;
  numPlayers: number;
  leader: Username;
  members: Username[];
  votes: Map<Username, Vote>;
  results: Map<Username, Vote>;
}

interface InternalState {
  creator: Username;
  players: Username[];
  roles: Map<Username, Role>;
  quests: InternalQuestAttempt[];
}

const ROLES_INFO: Map<Role, { isEvil: boolean; knownRoles: Set<Role> }> = new Map([
  [Role.MERLIN, { isEvil: false, knownRoles: new Set([Role.MORGANA, Role.ASSASSIN, Role.MINION, Role.OBERON]) }],
  [Role.PERCIVAL, { isEvil: false, knownRoles: new Set([Role.MERLIN, Role.MORGANA]) }],
  [Role.LOYAL_SERVANT, { isEvil: false, knownRoles: new Set() }],
  [Role.MORGANA, { isEvil: true, knownRoles: new Set([Role.MORDRED, Role.ASSASSIN, Role.MINION]) }],
  [Role.MORDRED, { isEvil: true, knownRoles: new Set([Role.MORGANA, Role.ASSASSIN, Role.MINION]) }],
  [Role.OBERON, { isEvil: true, knownRoles: new Set() }],
  [Role.ASSASSIN, { isEvil: true, knownRoles: new Set([Role.MORGANA, Role.MORDRED, Role.MINION]) }],
  [Role.MINION, { isEvil: true, knownRoles: new Set([Role.MORGANA, Role.MORDRED, Role.ASSASSIN, Role.MINION]) }],
]);

const QUEST_CONFIGURATIONS = new Map([
  [5, [2, 3, 2, 3, 3]],
  [6, [2, 3, 4, 3, 4]],
  [7, [2, 3, 3, 4, 4]],
  [8, [3, 4, 4, 5, 5]],
  [9, [3, 4, 4, 5, 5]],
  [10, [3, 4, 4, 5, 5]],
]);

export class Impl implements Methods<InternalState> {
  createGame(user: UserData, ctx: Context, request: ICreateGameRequest): InternalState {
    return {
      creator: user.name,
      players: [user.name],
      roles: new Map(),
      quests: [],
    };
  }
  joinGame(state: InternalState, user: UserData, ctx: Context, request: IJoinGameRequest): Result {
    if (state.players.find((player) => player === user.name) !== undefined) {
      return Result.unmodified("Already joined");
    }
    if (state.roles.size > 0) {
      return Result.unmodified("Game already started");
    }
    state.players.push(user.name);
    return Result.modified();
  }
  startGame(state: InternalState, user: UserData, ctx: Context, request: IStartGameRequest): Result {
    if (!QUEST_CONFIGURATIONS.has(state.players.length)) {
      return Result.unmodified("Invalid number of players");
    }
    if (request.roleList.length !== state.players.length) {
      return Result.unmodified("Wrong number of roles");
    }
    if (request.leader !== undefined && !state.players.includes(request.leader)) {
      return Result.unmodified("Invalid leader");
    }
    if (request.playerOrder !== undefined && request.playerOrder.length > 0) {
      if (
        request.playerOrder.length !== state.players.length ||
        !state.players.every((player) => request.playerOrder!.includes(player))
      ) {
        return Result.unmodified("Invalid player order");
      }
      state.players = request.playerOrder;
    } else {
      state.players = shuffle(ctx.randInt, state.players);
    }
    state.roles = new Map(shuffle(ctx.randInt, request.roleList).map((role, i) => [state.players[i], role]));
    const leader = request.leader ?? state.players[ctx.randInt(state.players.length)];
    state.quests.push(createQuest(1, 1, state.players.length, leader));
    return Result.modified();
  }
  proposeQuest(state: InternalState, user: UserData, ctx: Context, request: IProposeQuestRequest): Result {
    const quest = state.quests.find((q) => questId(q) === request.questId)!;
    if (quest === undefined) {
      return Result.unmodified("Invalid questId");
    }
    if (quest.members.length > 0) {
      return Result.unmodified("Quest already in progress");
    }
    if (quest.leader !== user.name) {
      return Result.unmodified("Not quest leader");
    }
    if (request.proposedMembers.length !== questSize(quest)) {
      return Result.unmodified("Wrong quest size");
    }
    if (!request.proposedMembers.every((member) => state.players.includes(member))) {
      return Result.unmodified("Invalid members");
    }
    quest.members = request.proposedMembers;
    return Result.modified();
  }
  voteForProposal(state: InternalState, user: UserData, ctx: Context, request: IVoteForProposalRequest): Result {
    const quest = state.quests.find((q) => questId(q) === request.questId);
    if (quest === undefined) {
      return Result.unmodified("Invalid questId");
    }
    if (questStatus(quest) !== QuestStatus.VOTING_FOR_PROPOSAL) {
      return Result.unmodified("Not voting for proposal");
    }
    quest.votes.set(user.name, request.vote);
    if (questStatus(quest) === QuestStatus.PROPOSAL_REJECTED && quest.attemptNumber < 5) {
      state.quests.push(
        createQuest(
          quest.roundNumber,
          quest.attemptNumber + 1,
          quest.numPlayers,
          getNextLeader(quest.leader, state.players)
        )
      );
    }
    return Result.modified();
  }
  voteInQuest(state: InternalState, user: UserData, ctx: Context, request: IVoteInQuestRequest): Result {
    const quest = state.quests.find((q) => questId(q) === request.questId);
    if (quest === undefined) {
      return Result.unmodified("Invalid questId");
    }
    if (questStatus(quest) !== QuestStatus.VOTING_IN_QUEST) {
      return Result.unmodified("Not voting in quest");
    }
    if (!quest.members.includes(user.name)) {
      return Result.unmodified("Not participating in quest");
    }
    quest.results.set(user.name, request.vote);
    if (
      quest.results.size === questSize(quest) &&
      numQuestsForStatus(state.quests, QuestStatus.FAILED) < 3 &&
      numQuestsForStatus(state.quests, QuestStatus.PASSED) < 3
    ) {
      state.quests.push(
        createQuest(quest.roundNumber + 1, 1, quest.numPlayers, getNextLeader(quest.leader, state.players))
      );
    }
    return Result.modified();
  }
  getUserState(state: InternalState, user: UserData): PlayerState {
    const role = state.roles.get(user.name);
    const knownRoles = role !== undefined ? ROLES_INFO.get(role)!.knownRoles : new Set();
    return {
      status: gameStatus(state.quests),
      rolesInfo: [...ROLES_INFO].map(([rl, info]) => ({
        role: rl,
        isEvil: info.isEvil,
        knownRoles: [...info.knownRoles],
        quantity: [...state.roles.values()].filter((r) => r === rl).length,
      })),
      creator: state.creator,
      players: state.players,
      role,
      knownPlayers: [...state.roles].filter(([_, r]) => knownRoles.has(r)).map(([p, _]) => p),
      playersPerQuest: QUEST_CONFIGURATIONS.get(state.players.length) || [],
      quests: state.quests.map((q) => sanitizeQuest(q, user.name)),
    };
  }
}

function createQuest(
  roundNumber: number,
  attemptNumber: number,
  numPlayers: number,
  leader: Username
): InternalQuestAttempt {
  return {
    roundNumber,
    attemptNumber,
    numPlayers,
    leader,
    members: [],
    votes: new Map(),
    results: new Map(),
  };
}

function getNextLeader(leader: Username, players: Username[]) {
  const idx = players.findIndex((p) => p === leader);
  return players[(idx + 1) % players.length];
}

function sanitizeQuest(quest: InternalQuestAttempt, username: Username): QuestAttempt {
  return {
    id: questId(quest),
    status: questStatus(quest),
    roundNumber: quest.roundNumber,
    attemptNumber: quest.attemptNumber,
    leader: quest.leader,
    members: quest.members,
    proposalVotes: [...quest.votes.entries()].map(([player, vote]) => ({
      player,
      vote: player === username || quest.votes.size === quest.numPlayers ? vote : undefined,
    })),
    results: [...quest.results.entries()].map(([player, vote]) => ({
      player,
      vote: player === username ? vote : undefined,
    })),
    numFailures: quest.results.size === questSize(quest) ? numFails(quest.results) : 0,
  };
}

function gameStatus(quests: InternalQuestAttempt[]) {
  if (quests.length === 0) {
    return GameStatus.NOT_STARTED;
  } else if (numQuestsForStatus(quests, QuestStatus.FAILED) > 2 || exceededQuestAttempts(quests.slice(-1)[0])) {
    return GameStatus.EVIL_WON;
  } else if (numQuestsForStatus(quests, QuestStatus.PASSED) > 2) {
    return GameStatus.GOOD_WON;
  }
  return GameStatus.IN_PROGRESS;
}

function numQuestsForStatus(quests: InternalQuestAttempt[], status: QuestStatus): number {
  return quests.filter((q) => questStatus(q) === status).length;
}

function questId(quest: InternalQuestAttempt) {
  return (quest.roundNumber - 1) * QUEST_CONFIGURATIONS.get(quest.numPlayers)!.length + (quest.attemptNumber - 1);
}

function questStatus(quest: InternalQuestAttempt) {
  if (quest.members.length === 0) {
    return QuestStatus.PROPOSING_QUEST;
  } else if (quest.votes.size < quest.numPlayers) {
    return QuestStatus.VOTING_FOR_PROPOSAL;
  } else if (numFails(quest.votes) * 2 >= quest.numPlayers) {
    return QuestStatus.PROPOSAL_REJECTED;
  } else if (quest.results.size < questSize(quest)) {
    return QuestStatus.VOTING_IN_QUEST;
  }
  return numFails(quest.results) >= maxFails(quest) ? QuestStatus.FAILED : QuestStatus.PASSED;
}

function questSize(quest: InternalQuestAttempt) {
  return QUEST_CONFIGURATIONS.get(quest.numPlayers)![quest.roundNumber - 1];
}

function numFails(votes: Map<Username, Vote>) {
  return [...votes.values()].filter((vote) => vote === Vote.FAIL).length;
}

function maxFails(quest: InternalQuestAttempt): number {
  return quest.numPlayers > 6 && quest.roundNumber === 4 ? 2 : 1;
}

function exceededQuestAttempts(quest: InternalQuestAttempt): boolean {
  return quest.attemptNumber === 5 && questStatus(quest) === QuestStatus.PROPOSAL_REJECTED;
}
