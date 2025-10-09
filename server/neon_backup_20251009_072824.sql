--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5 (6bc9ef8)
-- Dumped by pg_dump version 17.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: spades_owner
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO spades_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: spades_owner
--

COMMENT ON SCHEMA public IS '';


--
-- Name: GameFormat; Type: TYPE; Schema: public; Owner: spades_owner
--

CREATE TYPE public."GameFormat" AS ENUM (
    'REGULAR',
    'WHIZ',
    'MIRROR',
    'GIMMICK'
);


ALTER TYPE public."GameFormat" OWNER TO spades_owner;

--
-- Name: GameMode; Type: TYPE; Schema: public; Owner: spades_owner
--

CREATE TYPE public."GameMode" AS ENUM (
    'PARTNERS',
    'SOLO'
);


ALTER TYPE public."GameMode" OWNER TO spades_owner;

--
-- Name: GameStatus; Type: TYPE; Schema: public; Owner: spades_owner
--

CREATE TYPE public."GameStatus" AS ENUM (
    'WAITING',
    'BIDDING',
    'PLAYING',
    'FINISHED'
);


ALTER TYPE public."GameStatus" OWNER TO spades_owner;

--
-- Name: GimmickVariant; Type: TYPE; Schema: public; Owner: spades_owner
--

CREATE TYPE public."GimmickVariant" AS ENUM (
    'SUICIDE',
    'BID4NIL',
    'BID3',
    'BIDHEARTS',
    'CRAZY_ACES'
);


ALTER TYPE public."GimmickVariant" OWNER TO spades_owner;

--
-- Name: StatsFormat; Type: TYPE; Schema: public; Owner: spades_owner
--

CREATE TYPE public."StatsFormat" AS ENUM (
    'ALL',
    'REGULAR',
    'WHIZ',
    'MIRROR',
    'GIMMICK'
);


ALTER TYPE public."StatsFormat" OWNER TO spades_owner;

--
-- Name: StatsGimmickVariant; Type: TYPE; Schema: public; Owner: spades_owner
--

CREATE TYPE public."StatsGimmickVariant" AS ENUM (
    'ALL',
    'SUICIDE',
    'BID4NIL',
    'BID3',
    'BIDHEARTS',
    'CRAZY_ACES'
);


ALTER TYPE public."StatsGimmickVariant" OWNER TO spades_owner;

--
-- Name: StatsMode; Type: TYPE; Schema: public; Owner: spades_owner
--

CREATE TYPE public."StatsMode" AS ENUM (
    'ALL',
    'PARTNERS',
    'SOLO'
);


ALTER TYPE public."StatsMode" OWNER TO spades_owner;

--
-- Name: log_game_status_change(); Type: FUNCTION; Schema: public; Owner: spades_owner
--

CREATE FUNCTION public.log_game_status_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status = 'FINISHED' AND (OLD.status IS NULL OR OLD.status != 'FINISHED') THEN
    RAISE NOTICE 'GAME STATUS CHANGED TO FINISHED: game_id=%, old_status=%, new_status=%', NEW.id, OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.log_game_status_change() OWNER TO spades_owner;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: BlockedUser; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."BlockedUser" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "blockedId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."BlockedUser" OWNER TO spades_owner;

--
-- Name: Event; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."Event" (
    id text NOT NULL,
    name text NOT NULL,
    "startsAt" timestamp(3) without time zone NOT NULL,
    "endsAt" timestamp(3) without time zone NOT NULL,
    rules jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Event" OWNER TO spades_owner;

--
-- Name: EventGame; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."EventGame" (
    "eventId" text NOT NULL,
    "gameId" text NOT NULL
);


ALTER TABLE public."EventGame" OWNER TO spades_owner;

--
-- Name: Friend; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."Friend" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "friendId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Friend" OWNER TO spades_owner;

--
-- Name: Game; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."Game" (
    id text NOT NULL,
    "createdById" text NOT NULL,
    mode public."GameMode" NOT NULL,
    format public."GameFormat" NOT NULL,
    "gimmickVariant" public."GimmickVariant",
    "isLeague" boolean DEFAULT false NOT NULL,
    "isRated" boolean DEFAULT false NOT NULL,
    status public."GameStatus" NOT NULL,
    "minPoints" integer,
    "maxPoints" integer,
    "nilAllowed" boolean DEFAULT true,
    "blindNilAllowed" boolean DEFAULT false,
    "specialRules" jsonb,
    "startedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "buyIn" integer,
    "currentPlayer" text,
    "currentRound" integer,
    "currentTrick" integer,
    dealer integer,
    "gameState" jsonb,
    "lastActionAt" timestamp(3) without time zone
);


ALTER TABLE public."Game" OWNER TO spades_owner;

--
-- Name: GamePlayer; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."GamePlayer" (
    id text NOT NULL,
    "gameId" text NOT NULL,
    "userId" text NOT NULL,
    "seatIndex" integer,
    "teamIndex" integer,
    "isHuman" boolean DEFAULT true NOT NULL,
    "joinedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "leftAt" timestamp(3) without time zone,
    "isSpectator" boolean DEFAULT false
);


ALTER TABLE public."GamePlayer" OWNER TO spades_owner;

--
-- Name: GameResult; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."GameResult" (
    id text NOT NULL,
    "gameId" text NOT NULL,
    winner text NOT NULL,
    "team0Final" integer,
    "team1Final" integer,
    "player0Final" integer,
    "player1Final" integer,
    "player2Final" integer,
    "player3Final" integer,
    "totalRounds" integer NOT NULL,
    "totalTricks" integer NOT NULL,
    meta jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."GameResult" OWNER TO spades_owner;

--
-- Name: PlayerRoundStats; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."PlayerRoundStats" (
    id text NOT NULL,
    "roundId" text NOT NULL,
    "userId" text NOT NULL,
    "seatIndex" integer NOT NULL,
    "teamIndex" integer,
    bid integer,
    "isBlindNil" boolean DEFAULT false NOT NULL,
    "tricksWon" integer NOT NULL,
    "bagsThisRound" integer NOT NULL,
    "madeNil" boolean NOT NULL,
    "madeBlindNil" boolean NOT NULL
);


ALTER TABLE public."PlayerRoundStats" OWNER TO spades_owner;

--
-- Name: Round; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."Round" (
    id text NOT NULL,
    "gameId" text NOT NULL,
    "roundNumber" integer NOT NULL,
    "dealerSeatIndex" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Round" OWNER TO spades_owner;

--
-- Name: RoundHandSnapshot; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."RoundHandSnapshot" (
    id text NOT NULL,
    "roundId" text NOT NULL,
    "seatIndex" integer NOT NULL,
    cards jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."RoundHandSnapshot" OWNER TO spades_owner;

--
-- Name: RoundScore; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."RoundScore" (
    id text NOT NULL,
    "roundId" text NOT NULL,
    "team0Score" integer,
    "team1Score" integer,
    "team0Bags" integer,
    "team1Bags" integer,
    "team0RunningTotal" integer,
    "team1RunningTotal" integer,
    "player0Score" integer,
    "player1Score" integer,
    "player2Score" integer,
    "player3Score" integer,
    "player0Running" integer,
    "player1Running" integer,
    "player2Running" integer,
    "player3Running" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."RoundScore" OWNER TO spades_owner;

--
-- Name: Trick; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."Trick" (
    id text NOT NULL,
    "roundId" text NOT NULL,
    "trickNumber" integer NOT NULL,
    "leadSeatIndex" integer NOT NULL,
    "winningSeatIndex" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Trick" OWNER TO spades_owner;

--
-- Name: TrickCard; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."TrickCard" (
    id text NOT NULL,
    "trickId" text NOT NULL,
    "seatIndex" integer NOT NULL,
    suit text NOT NULL,
    rank text NOT NULL,
    "playOrder" integer NOT NULL,
    "playedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."TrickCard" OWNER TO spades_owner;

--
-- Name: User; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."User" (
    id text NOT NULL,
    "discordId" text NOT NULL,
    username text NOT NULL,
    "avatarUrl" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    coins integer DEFAULT 0 NOT NULL,
    "soundEnabled" boolean DEFAULT true NOT NULL
);


ALTER TABLE public."User" OWNER TO spades_owner;

--
-- Name: UserStats; Type: TABLE; Schema: public; Owner: spades_owner
--

CREATE TABLE public."UserStats" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "totalGamesPlayed" integer DEFAULT 0 NOT NULL,
    "totalGamesWon" integer DEFAULT 0 NOT NULL,
    "totalWinPct" double precision DEFAULT 0 NOT NULL,
    "totalBags" integer DEFAULT 0 NOT NULL,
    "totalBagsPerGame" double precision DEFAULT 0 NOT NULL,
    "totalNilsBid" integer DEFAULT 0 NOT NULL,
    "totalNilsMade" integer DEFAULT 0 NOT NULL,
    "totalNilPct" double precision DEFAULT 0 NOT NULL,
    "totalBlindNilsBid" integer DEFAULT 0 NOT NULL,
    "totalBlindNilsMade" integer DEFAULT 0 NOT NULL,
    "totalBlindNilPct" double precision DEFAULT 0 NOT NULL,
    "totalRegularPlayed" integer DEFAULT 0 NOT NULL,
    "totalRegularWon" integer DEFAULT 0 NOT NULL,
    "totalRegularWinPct" double precision DEFAULT 0 NOT NULL,
    "totalWhizPlayed" integer DEFAULT 0 NOT NULL,
    "totalWhizWon" integer DEFAULT 0 NOT NULL,
    "totalWhizWinPct" double precision DEFAULT 0 NOT NULL,
    "totalMirrorPlayed" integer DEFAULT 0 NOT NULL,
    "totalMirrorWon" integer DEFAULT 0 NOT NULL,
    "totalMirrorWinPct" double precision DEFAULT 0 NOT NULL,
    "totalGimmickPlayed" integer DEFAULT 0 NOT NULL,
    "totalGimmickWon" integer DEFAULT 0 NOT NULL,
    "totalGimmickWinPct" double precision DEFAULT 0 NOT NULL,
    "totalScreamerPlayed" integer DEFAULT 0 NOT NULL,
    "totalScreamerWon" integer DEFAULT 0 NOT NULL,
    "totalScreamerWinPct" double precision DEFAULT 0 NOT NULL,
    "totalAssassinPlayed" integer DEFAULT 0 NOT NULL,
    "totalAssassinWon" integer DEFAULT 0 NOT NULL,
    "totalAssassinWinPct" double precision DEFAULT 0 NOT NULL,
    "leagueGamesPlayed" integer DEFAULT 0 NOT NULL,
    "leagueGamesWon" integer DEFAULT 0 NOT NULL,
    "leagueWinPct" double precision DEFAULT 0 NOT NULL,
    "leagueBags" integer DEFAULT 0 NOT NULL,
    "leagueBagsPerGame" double precision DEFAULT 0 NOT NULL,
    "leagueNilsBid" integer DEFAULT 0 NOT NULL,
    "leagueNilsMade" integer DEFAULT 0 NOT NULL,
    "leagueNilPct" double precision DEFAULT 0 NOT NULL,
    "leagueBlindNilsBid" integer DEFAULT 0 NOT NULL,
    "leagueBlindNilsMade" integer DEFAULT 0 NOT NULL,
    "leagueBlindNilPct" double precision DEFAULT 0 NOT NULL,
    "leagueRegularPlayed" integer DEFAULT 0 NOT NULL,
    "leagueRegularWon" integer DEFAULT 0 NOT NULL,
    "leagueRegularWinPct" double precision DEFAULT 0 NOT NULL,
    "leagueWhizPlayed" integer DEFAULT 0 NOT NULL,
    "leagueWhizWon" integer DEFAULT 0 NOT NULL,
    "leagueWhizWinPct" double precision DEFAULT 0 NOT NULL,
    "leagueMirrorPlayed" integer DEFAULT 0 NOT NULL,
    "leagueMirrorWon" integer DEFAULT 0 NOT NULL,
    "leagueMirrorWinPct" double precision DEFAULT 0 NOT NULL,
    "leagueGimmickPlayed" integer DEFAULT 0 NOT NULL,
    "leagueGimmickWon" integer DEFAULT 0 NOT NULL,
    "leagueGimmickWinPct" double precision DEFAULT 0 NOT NULL,
    "leagueScreamerPlayed" integer DEFAULT 0 NOT NULL,
    "leagueScreamerWon" integer DEFAULT 0 NOT NULL,
    "leagueScreamerWinPct" double precision DEFAULT 0 NOT NULL,
    "leagueAssassinPlayed" integer DEFAULT 0 NOT NULL,
    "leagueAssassinWon" integer DEFAULT 0 NOT NULL,
    "leagueAssassinWinPct" double precision DEFAULT 0 NOT NULL,
    "partnersGamesPlayed" integer DEFAULT 0 NOT NULL,
    "partnersGamesWon" integer DEFAULT 0 NOT NULL,
    "partnersWinPct" double precision DEFAULT 0 NOT NULL,
    "partnersBags" integer DEFAULT 0 NOT NULL,
    "partnersBagsPerGame" double precision DEFAULT 0 NOT NULL,
    "partnersNilsBid" integer DEFAULT 0 NOT NULL,
    "partnersNilsMade" integer DEFAULT 0 NOT NULL,
    "partnersNilPct" double precision DEFAULT 0 NOT NULL,
    "partnersBlindNilsBid" integer DEFAULT 0 NOT NULL,
    "partnersBlindNilsMade" integer DEFAULT 0 NOT NULL,
    "partnersBlindNilPct" double precision DEFAULT 0 NOT NULL,
    "partnersRegularPlayed" integer DEFAULT 0 NOT NULL,
    "partnersRegularWon" integer DEFAULT 0 NOT NULL,
    "partnersRegularWinPct" double precision DEFAULT 0 NOT NULL,
    "partnersWhizPlayed" integer DEFAULT 0 NOT NULL,
    "partnersWhizWon" integer DEFAULT 0 NOT NULL,
    "partnersWhizWinPct" double precision DEFAULT 0 NOT NULL,
    "partnersMirrorPlayed" integer DEFAULT 0 NOT NULL,
    "partnersMirrorWon" integer DEFAULT 0 NOT NULL,
    "partnersMirrorWinPct" double precision DEFAULT 0 NOT NULL,
    "partnersGimmickPlayed" integer DEFAULT 0 NOT NULL,
    "partnersGimmickWon" integer DEFAULT 0 NOT NULL,
    "partnersGimmickWinPct" double precision DEFAULT 0 NOT NULL,
    "partnersScreamerPlayed" integer DEFAULT 0 NOT NULL,
    "partnersScreamerWon" integer DEFAULT 0 NOT NULL,
    "partnersScreamerWinPct" double precision DEFAULT 0 NOT NULL,
    "partnersAssassinPlayed" integer DEFAULT 0 NOT NULL,
    "partnersAssassinWon" integer DEFAULT 0 NOT NULL,
    "partnersAssassinWinPct" double precision DEFAULT 0 NOT NULL,
    "soloGamesPlayed" integer DEFAULT 0 NOT NULL,
    "soloGamesWon" integer DEFAULT 0 NOT NULL,
    "soloWinPct" double precision DEFAULT 0 NOT NULL,
    "soloBags" integer DEFAULT 0 NOT NULL,
    "soloBagsPerGame" double precision DEFAULT 0 NOT NULL,
    "soloNilsBid" integer DEFAULT 0 NOT NULL,
    "soloNilsMade" integer DEFAULT 0 NOT NULL,
    "soloNilPct" double precision DEFAULT 0 NOT NULL,
    "soloBlindNilsBid" integer DEFAULT 0 NOT NULL,
    "soloBlindNilsMade" integer DEFAULT 0 NOT NULL,
    "soloBlindNilPct" double precision DEFAULT 0 NOT NULL,
    "soloRegularPlayed" integer DEFAULT 0 NOT NULL,
    "soloRegularWon" integer DEFAULT 0 NOT NULL,
    "soloRegularWinPct" double precision DEFAULT 0 NOT NULL,
    "soloWhizPlayed" integer DEFAULT 0 NOT NULL,
    "soloWhizWon" integer DEFAULT 0 NOT NULL,
    "soloWhizWinPct" double precision DEFAULT 0 NOT NULL,
    "soloMirrorPlayed" integer DEFAULT 0 NOT NULL,
    "soloMirrorWon" integer DEFAULT 0 NOT NULL,
    "soloMirrorWinPct" double precision DEFAULT 0 NOT NULL,
    "soloGimmickPlayed" integer DEFAULT 0 NOT NULL,
    "soloGimmickWon" integer DEFAULT 0 NOT NULL,
    "soloGimmickWinPct" double precision DEFAULT 0 NOT NULL,
    "soloScreamerPlayed" integer DEFAULT 0 NOT NULL,
    "soloScreamerWon" integer DEFAULT 0 NOT NULL,
    "soloScreamerWinPct" double precision DEFAULT 0 NOT NULL,
    "soloAssassinPlayed" integer DEFAULT 0 NOT NULL,
    "soloAssassinWon" integer DEFAULT 0 NOT NULL,
    "soloAssassinWinPct" double precision DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."UserStats" OWNER TO spades_owner;

--
-- Data for Name: BlockedUser; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."BlockedUser" (id, "userId", "blockedId", "createdAt", "updatedAt") FROM stdin;
cmfx5ri2d003dga00vqmyklgk	cmeldrfox00005u7rkabojtcd	cmet096ge0000y1yvvcsz3qm7	2025-08-27 21:27:39.419	2025-08-27 21:27:39.419
cmfx5rik4003fga00qlj8j4q6	cmeldrfox00005u7rkabojtcd	cmervaobj0003krk7msha13vm	2025-08-27 21:27:51.302	2025-08-27 21:27:51.302
\.


--
-- Data for Name: Event; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."Event" (id, name, "startsAt", "endsAt", rules, "isActive", "createdAt") FROM stdin;
\.


--
-- Data for Name: EventGame; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."EventGame" ("eventId", "gameId") FROM stdin;
\.


--
-- Data for Name: Friend; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."Friend" (id, "userId", "friendId", "createdAt", "updatedAt") FROM stdin;
cmfx5qupr0001ga00s9mayzms	cme9k0isv000olqk54zt6ookh	cme8sw3nv000314p8llo0smff	2025-08-15 15:30:13.884	2025-08-15 15:30:13.884
cmfx5qvcb0003ga001rkcqlcd	cme9k0isv000olqk54zt6ookh	cme8sw3zz000614p8mp1mzbag	2025-08-15 15:30:14.644	2025-08-15 15:30:14.644
cmfx5qvok0005ga003u9glx7r	cme8sw339000014p8j5ob6bh7	cmed2cnw0003q13okshe5sm9w	2025-08-15 20:34:47.499	2025-08-15 20:34:47.499
cmfx5qw1j0007ga006xhed3ue	cmefuocj800kxv9yeav16azg6	cme8sxzbj000b14p861bs8ou4	2025-08-17 18:19:06.005	2025-08-17 18:19:06.005
cmfx5qwdt0009ga0034udikax	cmefuocj800kxv9yeav16azg6	cme8sw3zz000614p8mp1mzbag	2025-08-17 18:19:18.836	2025-08-17 18:19:18.836
cmfx5qwqk000bga00a4lki4ul	cmefuocj800kxv9yeav16azg6	cmefzqiup00t0v9yep9lrmmvk	2025-08-17 18:19:46.452	2025-08-17 18:19:46.452
cmfx5qx3v000dga00tksz3k52	cmeh82anp00xyv9yen7bf3vni	cme90quhl0003613vw4mu0c6i	2025-08-18 14:41:26.846	2025-08-18 14:41:26.846
cmfx5qxgo000fga00b65xsqik	cme9k0isv000olqk54zt6ookh	cme8t9p1e0000tfu44l4no4ty	2025-08-20 17:59:28.847	2025-08-20 17:59:28.847
cmfx5qxu0000hga000gi3cgu8	cmefuocj800kxv9yeav16azg6	cmejhlzzc0000x01kmh8iokih	2025-08-20 23:33:29.523	2025-08-20 23:33:29.523
cmfx5qy6t000jga00tcy3aoyv	cme8sw339000014p8j5ob6bh7	cmefzqiup00t0v9yep9lrmmvk	2025-08-21 01:14:08.904	2025-08-21 01:14:08.904
cmfx5qyke000lga00hq6zat9v	cme8sw339000014p8j5ob6bh7	cmefuocj800kxv9yeav16azg6	2025-08-23 17:29:05.708	2025-08-23 17:29:05.708
cmfx5qywm000nga008auu39s3	cmeoh9akw00ek5vv5nzcmsodb	cmeldrfox00005u7rkabojtcd	2025-08-23 17:31:19.188	2025-08-23 17:31:19.188
cmfx5qz9r000pga008q1y080u	cmeoh9akw00ek5vv5nzcmsodb	cme8sw3nv000314p8llo0smff	2025-08-23 17:31:22.011	2025-08-23 17:31:22.011
cmfx5qzn8000rga008re5rht3	cmeoh9akw00ek5vv5nzcmsodb	cme9k0isv000olqk54zt6ookh	2025-08-23 18:04:09.054	2025-08-23 18:04:09.054
cmfx5qzzx000tga00a4c06o3w	cmeoh9akw00ek5vv5nzcmsodb	cme97k7iz0064al60lhmhvicw	2025-08-23 18:04:50.161	2025-08-23 18:04:50.161
cmfx5r0cs000vga003qlb9r5m	cmeoh9akw00ek5vv5nzcmsodb	cme8sxzbj000b14p861bs8ou4	2025-08-23 18:18:09.578	2025-08-23 18:18:09.578
cmfx5r0po000xga007itdjcbu	cmeoh9akw00ek5vv5nzcmsodb	cme8sw339000014p8j5ob6bh7	2025-08-23 18:53:37.961	2025-08-23 18:53:37.961
cmfx5r13j000zga00s05081y4	cmeoh9akw00ek5vv5nzcmsodb	cmefuocj800kxv9yeav16azg6	2025-08-24 00:37:40.406	2025-08-24 00:37:40.406
cmfx5r1fg0011ga004pankgrk	cmeoh9akw00ek5vv5nzcmsodb	cmeeo3s9s000av9ye52y13xqm	2025-08-24 01:27:45.511	2025-08-24 01:27:45.511
cmfx5r1sm0013ga00flkzkprc	cmeoh9akw00ek5vv5nzcmsodb	cme8sw3zz000614p8mp1mzbag	2025-08-24 01:27:46.803	2025-08-24 01:27:46.803
cmfx5r2500015ga00ttvugwgg	cme9k0isv000olqk54zt6ookh	cmeoh9akw00ek5vv5nzcmsodb	2025-08-24 16:32:38.086	2025-08-24 16:32:38.086
cmfx5r2hs0017ga00epo4zaho	cme9k0isv000olqk54zt6ookh	cmeldrfox00005u7rkabojtcd	2025-08-24 16:32:43.267	2025-08-24 16:32:43.267
cmfx5r2va0019ga00e16qd912	cmeoh9akw00ek5vv5nzcmsodb	cme8t9p1e0000tfu44l4no4ty	2025-08-24 16:45:35.575	2025-08-24 16:45:35.575
cmfx5r387001bga00dqld7ejq	cmervaobj0003krk7msha13vm	cme9k0isv000olqk54zt6ookh	2025-08-26 12:08:25.664	2025-08-26 12:08:25.664
cmfx5r3kf001dga00eukgdjgy	cmervaobj0003krk7msha13vm	cmeoh9akw00ek5vv5nzcmsodb	2025-08-26 12:08:34.112	2025-08-26 12:08:34.112
cmfx5r3xt001fga00i66hyn27	cmervaobj0003krk7msha13vm	cmeldrfox00005u7rkabojtcd	2025-08-26 12:08:42.488	2025-08-26 12:08:42.488
cmfx5r4a8001hga0007i22t4n	cmervaobj0003krk7msha13vm	cmekciote0007h1laeibqj8cu	2025-08-26 12:09:16.511	2025-08-26 12:09:16.511
cmfx5r4n3001jga006yv19epv	cmervaobj0003krk7msha13vm	cmefuocj800kxv9yeav16azg6	2025-08-26 12:09:21.402	2025-08-26 12:09:21.402
cmfx5r507001lga00lkuelx6s	cmervaobj0003krk7msha13vm	cme8sxzbj000b14p861bs8ou4	2025-08-26 12:09:35.696	2025-08-26 12:09:35.696
cmfx5r5gd001nga00r6229r1e	cmervaobj0003krk7msha13vm	cme99rv1v0000gx2y3a6hvbmx	2025-08-26 12:09:49.002	2025-08-26 12:09:49.002
cmfx5r5sn001pga00jzep986d	cmervaobj0003krk7msha13vm	cme97k7iz0064al60lhmhvicw	2025-08-26 12:10:00.599	2025-08-26 12:10:00.599
cmfx5r64w001rga00f6w75ae8	cmervaobj0003krk7msha13vm	cme8x5vnx00043q059ay59zhu	2025-08-26 12:10:13.146	2025-08-26 12:10:13.146
cmfx5r6h4001tga00gw35nptj	cmervaobj0003krk7msha13vm	cmejhlzzc0000x01kmh8iokih	2025-08-26 12:10:43.787	2025-08-26 12:10:43.787
cmfx5r6u5001vga00ickl8jdt	cmervaobj0003krk7msha13vm	cme8t9p1e0000tfu44l4no4ty	2025-08-26 22:52:04.492	2025-08-26 22:52:04.492
cmfx5r77c001xga00qx35lq3p	cmervaobj0003krk7msha13vm	cme8sw339000014p8j5ob6bh7	2025-08-26 22:52:35.074	2025-08-26 22:52:35.074
cmfx5r7lo001zga00wk310h60	cmervaobj0003krk7msha13vm	cmet096ge0000y1yvvcsz3qm7	2025-08-26 22:52:55.32	2025-08-26 22:52:55.32
cmfx5r7y40021ga00ace2odrr	cmervaobj0003krk7msha13vm	cmeeo3s9s000av9ye52y13xqm	2025-08-26 22:53:07.342	2025-08-26 22:53:07.342
cmfx5r8ar0023ga00ci7ksb85	cmervaobj0003krk7msha13vm	cmennilkd0000golvg384s0oj	2025-08-26 22:53:16.781	2025-08-26 22:53:16.781
cmfx5r8nq0025ga00gtaiwjqp	cmeoh9akw00ek5vv5nzcmsodb	cmet7u1vg00ca12n43rweewxq	2025-08-27 00:46:58.719	2025-08-27 00:46:58.719
cmfx5r9060027ga00tgluvxzj	cmeeo3s9s000av9ye52y13xqm	cmet096ge0000y1yvvcsz3qm7	2025-08-27 01:56:27.755	2025-08-27 01:56:27.755
cmfx5r9cq0029ga000i4zxf6c	cmeeo3s9s000av9ye52y13xqm	cme99rv1v0000gx2y3a6hvbmx	2025-08-27 01:56:33.479	2025-08-27 01:56:33.479
cmfx5r9pg002bga00nhgysy1q	cmeeo3s9s000av9ye52y13xqm	cmeoh9akw00ek5vv5nzcmsodb	2025-08-27 01:56:36.317	2025-08-27 01:56:36.317
cmfx5ra3k002dga00c3ato4r9	cmeoh9akw00ek5vv5nzcmsodb	cmetelokc00z112n46dt7sv3t	2025-08-27 03:23:28.166	2025-08-27 03:23:28.166
cmfx5raj4002fga00clb5qbcn	cmeoh9akw00ek5vv5nzcmsodb	cmervaobj0003krk7msha13vm	2025-08-27 19:49:24.579	2025-08-27 19:49:24.579
cmfx5rayj002hga002xii2oei	cmeldrfox00005u7rkabojtcd	cmeoh9akw00ek5vv5nzcmsodb	2025-08-27 21:28:04.848	2025-08-27 21:28:04.848
cmfx5rbbd002jga007cu8ox4v	cmervaobj0003krk7msha13vm	cmet7u1vg00ca12n43rweewxq	2025-08-27 22:28:14.705	2025-08-27 22:28:14.705
cmfx5rbns002lga002o6906fz	cmervaobj0003krk7msha13vm	cme8sw3nv000314p8llo0smff	2025-08-27 22:29:37.338	2025-08-27 22:29:37.338
cmfx5rcsk002pga00mdxpavwy	cmeoh9akw00ek5vv5nzcmsodb	cme99rv1v0000gx2y3a6hvbmx	2025-09-21 13:14:32.795	2025-09-21 13:14:32.794
cmfx5rd5k002rga005kger3uf	cmeoh9akw00ek5vv5nzcmsodb	user_1756340694873_oq0djepnu	2025-09-21 13:14:46.156	2025-09-21 13:14:46.156
cmfx5rdvz002vga00jw7xn7y3	cmeoh9akw00ek5vv5nzcmsodb	user_1757771662780_d2kw3pj67	2025-09-21 13:15:13.079	2025-09-21 13:15:13.078
cmfx5re8q002xga00ziwernrd	cmeoh9akw00ek5vv5nzcmsodb	user_1757527136930_fdacrk0ap	2025-09-21 13:15:30.488	2025-09-21 13:15:30.487
cmfx5rena002zga00st9fi7vx	cmeoh9akw00ek5vv5nzcmsodb	cmeqgq73n02kf39t5ijzp09n9	2025-09-21 13:15:50.814	2025-09-21 13:15:50.812
cmfx5rf0v0031ga0069g5ery8	cmeoh9akw00ek5vv5nzcmsodb	cmennilkd0000golvg384s0oj	2025-09-21 13:16:15.669	2025-09-21 13:16:15.668
cmfx5rffz0033ga00ei97r5mw	cmeoh9akw00ek5vv5nzcmsodb	cme8x5vnx00043q059ay59zhu	2025-09-21 13:16:25.299	2025-09-21 13:16:25.298
cmfx5rfue0035ga00abjmpj5t	cmeoh9akw00ek5vv5nzcmsodb	cmefzqiup00t0v9yep9lrmmvk	2025-09-21 13:16:35.006	2025-09-21 13:16:35.005
cmfx5rg7e0037ga009xe5tfu0	cmeoh9akw00ek5vv5nzcmsodb	user_1757710584128_ab1ebkxga	2025-09-21 13:20:59.715	2025-09-21 13:20:59.713
cmfx5rgnc0039ga008y9tn97e	cmeoh9akw00ek5vv5nzcmsodb	user_1756591409813_rb94largi	2025-09-21 13:49:49.028	2025-09-21 13:49:49.028
cmfx5rh2j003bga00y2306its	cmeoh9akw00ek5vv5nzcmsodb	cme8w05ct000083p8y1emwk38	2025-09-21 13:50:17.178	2025-09-21 13:50:17.177
\.


--
-- Data for Name: Game; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."Game" (id, "createdById", mode, format, "gimmickVariant", "isLeague", "isRated", status, "minPoints", "maxPoints", "nilAllowed", "blindNilAllowed", "specialRules", "startedAt", "finishedAt", "createdAt", "updatedAt", "buyIn", "currentPlayer", "currentRound", "currentTrick", dealer, "gameState", "lastActionAt") FROM stdin;
game_1759990191630_v9adkqovm	cmgj07tmh00030zgi3o8xrvwy	PARTNERS	REGULAR	\N	f	f	WAITING	-100	100	t	f	{"allowNil": true, "assassin": false, "screamer": false, "allowBlindNil": false}	\N	\N	2025-10-09 06:09:52.527	2025-10-09 06:27:25.973	100000	\N	1	0	0	{"id": "game_1759990191630_v9adkqovm", "mode": "PARTNERS", "buyIn": 100000, "rules": {"bidType": "REG", "allowNil": true, "gameType": "PARTNERS", "maxPoints": 200, "minPoints": -100, "coinAmount": 0, "specialRules": {"assassin": false, "screamer": false}, "allowBlindNil": false}, "format": "REGULAR", "maxPoints": 100, "minPoints": -100, "nilAllowed": true, "createdById": "cmgj07tmh00030zgi3o8xrvwy", "specialRules": {"allowNil": true, "assassin": false, "screamer": false, "allowBlindNil": false}, "gimmickVariant": null, "blindNilAllowed": false, "createdByAvatar": null, "createdByUsername": "Tom [BUX$DAO]"}	\N
\.


--
-- Data for Name: GamePlayer; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."GamePlayer" (id, "gameId", "userId", "seatIndex", "teamIndex", "isHuman", "joinedAt", "leftAt", "isSpectator") FROM stdin;
cmgj0pvzf000erchskahk9cg9	game_1759990191630_v9adkqovm	cmgj07tmh00030zgi3o8xrvwy	0	0	t	2025-10-09 06:09:52.682	\N	f
cmgj0q2ov000hrchs5djbdxy3	game_1759990191630_v9adkqovm	cmgj0q2km000frchsu4kttcp0	1	1	f	2025-10-09 06:10:01.374	\N	f
cmgj0q2t5000lrchsvurzq9zi	game_1759990191630_v9adkqovm	cmgj0q2ov000irchsgpokbny7	2	0	f	2025-10-09 06:10:01.527	\N	f
cmgj0q2yc000nrchs8ff05z17	game_1759990191630_v9adkqovm	cmgj0q2q0000jrchs5jzhsuea	3	1	f	2025-10-09 06:10:01.715	\N	f
\.


--
-- Data for Name: GameResult; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."GameResult" (id, "gameId", winner, "team0Final", "team1Final", "player0Final", "player1Final", "player2Final", "player3Final", "totalRounds", "totalTricks", meta, "createdAt") FROM stdin;
\.


--
-- Data for Name: PlayerRoundStats; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."PlayerRoundStats" (id, "roundId", "userId", "seatIndex", "teamIndex", bid, "isBlindNil", "tricksWon", "bagsThisRound", "madeNil", "madeBlindNil") FROM stdin;
cmgj0q636000srchs6l0pf08q	cmgj0q4k3000prchs0wrob14j	cmgj07tmh00030zgi3o8xrvwy	0	0	2	f	5	3	f	f
cmgj0q7d1000vrchsjffgrxdc	cmgj0q4k3000prchs0wrob14j	cmgj0q2km000frchsu4kttcp0	1	1	3	f	2	0	f	f
cmgj0q825000yrchsminxw59m	cmgj0q4k3000prchs0wrob14j	cmgj0q2ov000irchsgpokbny7	2	0	4	f	4	0	f	f
cmgj0q8r50011rchsevefb4qf	cmgj0q4k3000prchs0wrob14j	cmgj0q2q0000jrchs5jzhsuea	3	1	3	f	2	0	f	f
cmgj0yoxl004srchsyafayif3	cmgj0ym4j004prchsoajx9orp	cmgj07tmh00030zgi3o8xrvwy	0	0	\N	f	0	0	f	f
cmgj0yq7n004vrchs98uwg03y	cmgj0ym4j004prchsoajx9orp	cmgj0q2km000frchsu4kttcp0	1	1	\N	f	0	0	f	f
cmgj0yqwx004yrchsjlr6xsc0	cmgj0ym4j004prchsoajx9orp	cmgj0q2ov000irchsgpokbny7	2	0	1	f	0	0	f	f
cmgj0yrm40051rchs37lgcibz	cmgj0ym4j004prchsoajx9orp	cmgj0q2q0000jrchs5jzhsuea	3	1	4	f	0	0	f	f
\.


--
-- Data for Name: Round; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."Round" (id, "gameId", "roundNumber", "dealerSeatIndex", "createdAt") FROM stdin;
cmgj0q4k3000prchs0wrob14j	game_1759990191630_v9adkqovm	1	0	2025-10-09 06:10:03.795
cmgj0ym4j004prchsoajx9orp	game_1759990191630_v9adkqovm	2	1	2025-10-09 06:16:39.812
\.


--
-- Data for Name: RoundHandSnapshot; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."RoundHandSnapshot" (id, "roundId", "seatIndex", cards, "createdAt") FROM stdin;
cmgj0yop6004rrchs0vcfeffj	cmgj0ym4j004prchsoajx9orp	0	"[{\\"suit\\":\\"CLUBS\\",\\"rank\\":\\"5\\"},{\\"suit\\":\\"SPADES\\",\\"rank\\":\\"Q\\"},{\\"suit\\":\\"DIAMONDS\\",\\"rank\\":\\"5\\"},{\\"suit\\":\\"HEARTS\\",\\"rank\\":\\"9\\"},{\\"suit\\":\\"SPADES\\",\\"rank\\":\\"4\\"},{\\"suit\\":\\"CLUBS\\",\\"rank\\":\\"7\\"},{\\"suit\\":\\"HEARTS\\",\\"rank\\":\\"Q\\"},{\\"suit\\":\\"HEARTS\\",\\"rank\\":\\"7\\"},{\\"suit\\":\\"HEARTS\\",\\"rank\\":\\"5\\"},{\\"suit\\":\\"SPADES\\",\\"rank\\":\\"J\\"},{\\"suit\\":\\"CLUBS\\",\\"rank\\":\\"A\\"},{\\"suit\\":\\"DIAMONDS\\",\\"rank\\":\\"A\\"},{\\"suit\\":\\"SPADES\\",\\"rank\\":\\"5\\"}]"	2025-10-09 06:16:43.147
cmgj0yq3f004urchsfgz2ywl8	cmgj0ym4j004prchsoajx9orp	1	"[{\\"suit\\":\\"CLUBS\\",\\"rank\\":\\"4\\"},{\\"suit\\":\\"HEARTS\\",\\"rank\\":\\"3\\"},{\\"suit\\":\\"SPADES\\",\\"rank\\":\\"9\\"},{\\"suit\\":\\"SPADES\\",\\"rank\\":\\"6\\"},{\\"suit\\":\\"DIAMONDS\\",\\"rank\\":\\"2\\"},{\\"suit\\":\\"DIAMONDS\\",\\"rank\\":\\"4\\"},{\\"suit\\":\\"HEARTS\\",\\"rank\\":\\"6\\"},{\\"suit\\":\\"SPADES\\",\\"rank\\":\\"7\\"},{\\"suit\\":\\"CLUBS\\",\\"rank\\":\\"K\\"},{\\"suit\\":\\"CLUBS\\",\\"rank\\":\\"3\\"},{\\"suit\\":\\"HEARTS\\",\\"rank\\":\\"A\\"},{\\"suit\\":\\"SPADES\\",\\"rank\\":\\"10\\"},{\\"suit\\":\\"CLUBS\\",\\"rank\\":\\"6\\"}]"	2025-10-09 06:16:44.955
cmgj0yqsp004xrchsakw56igm	cmgj0ym4j004prchsoajx9orp	2	"[{\\"suit\\":\\"DIAMONDS\\",\\"rank\\":\\"Q\\"},{\\"suit\\":\\"CLUBS\\",\\"rank\\":\\"9\\"},{\\"suit\\":\\"CLUBS\\",\\"rank\\":\\"10\\"},{\\"suit\\":\\"HEARTS\\",\\"rank\\":\\"8\\"},{\\"suit\\":\\"DIAMONDS\\",\\"rank\\":\\"7\\"},{\\"suit\\":\\"DIAMONDS\\",\\"rank\\":\\"J\\"},{\\"suit\\":\\"SPADES\\",\\"rank\\":\\"2\\"},{\\"suit\\":\\"CLUBS\\",\\"rank\\":\\"Q\\"},{\\"suit\\":\\"HEARTS\\",\\"rank\\":\\"J\\"},{\\"suit\\":\\"HEARTS\\",\\"rank\\":\\"K\\"},{\\"suit\\":\\"DIAMONDS\\",\\"rank\\":\\"9\\"},{\\"suit\\":\\"HEARTS\\",\\"rank\\":\\"4\\"},{\\"suit\\":\\"CLUBS\\",\\"rank\\":\\"8\\"}]"	2025-10-09 06:16:45.865
cmgj0q7xy000xrchsivgd43xe	cmgj0q4k3000prchs0wrob14j	2	[]	2025-10-09 06:10:08.182
cmgj0q8my0010rchsy99tp48l	cmgj0q4k3000prchs0wrob14j	3	[]	2025-10-09 06:10:09.083
cmgj0q5un000rrchs085k1nsl	cmgj0q4k3000prchs0wrob14j	0	[]	2025-10-09 06:10:05.471
cmgj0q78u000urchsi51o01np	cmgj0q4k3000prchs0wrob14j	1	[]	2025-10-09 06:10:07.278
cmgj0yrhw0050rchsams3k8pj	cmgj0ym4j004prchsoajx9orp	3	"[{\\"suit\\":\\"SPADES\\",\\"rank\\":\\"3\\"},{\\"suit\\":\\"DIAMONDS\\",\\"rank\\":\\"8\\"},{\\"suit\\":\\"DIAMONDS\\",\\"rank\\":\\"10\\"},{\\"suit\\":\\"CLUBS\\",\\"rank\\":\\"J\\"},{\\"suit\\":\\"HEARTS\\",\\"rank\\":\\"10\\"},{\\"suit\\":\\"SPADES\\",\\"rank\\":\\"8\\"},{\\"suit\\":\\"SPADES\\",\\"rank\\":\\"A\\"},{\\"suit\\":\\"HEARTS\\",\\"rank\\":\\"2\\"},{\\"suit\\":\\"DIAMONDS\\",\\"rank\\":\\"K\\"},{\\"suit\\":\\"DIAMONDS\\",\\"rank\\":\\"6\\"},{\\"suit\\":\\"SPADES\\",\\"rank\\":\\"K\\"},{\\"suit\\":\\"CLUBS\\",\\"rank\\":\\"2\\"},{\\"suit\\":\\"DIAMONDS\\",\\"rank\\":\\"3\\"}]"	2025-10-09 06:16:46.772
\.


--
-- Data for Name: RoundScore; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."RoundScore" (id, "roundId", "team0Score", "team1Score", "team0Bags", "team1Bags", "team0RunningTotal", "team1RunningTotal", "player0Score", "player1Score", "player2Score", "player3Score", "player0Running", "player1Running", "player2Running", "player3Running", "createdAt") FROM stdin;
cmgj0q4k3000prchs0wrob14j	cmgj0q4k3000prchs0wrob14j	63	-60	3	0	63	-60	\N	\N	\N	\N	\N	\N	\N	\N	2025-10-09 06:16:25.785
\.


--
-- Data for Name: Trick; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."Trick" (id, "roundId", "trickNumber", "leadSeatIndex", "winningSeatIndex", "createdAt") FROM stdin;
cmgj0qr5b0013rchsxq7vbupg	cmgj0q4k3000prchs0wrob14j	1	1	0	2025-10-09 06:10:33.071
cmgj0rajf001drchsqpo2gfy1	cmgj0q4k3000prchs0wrob14j	2	0	3	2025-10-09 06:10:58.202
cmgj0rr19001nrchsjsv48c5i	cmgj0q4k3000prchs0wrob14j	3	3	0	2025-10-09 06:11:19.58
cmgj0s7k1001xrchs75gymovs	cmgj0q4k3000prchs0wrob14j	4	0	0	2025-10-09 06:11:40.992
cmgj0sns70027rchs3a1zfu84	cmgj0q4k3000prchs0wrob14j	5	0	2	2025-10-09 06:12:02.022
cmgj0t7pu002hrchsr065hcvd	cmgj0q4k3000prchs0wrob14j	6	2	0	2025-10-09 06:12:27.857
cmgj0toa6002rrchspx8tqbms	cmgj0q4k3000prchs0wrob14j	7	0	0	2025-10-09 06:12:49.325
cmgj0u6g30031rchsiu7r0opw	cmgj0q4k3000prchs0wrob14j	8	0	1	2025-10-09 06:13:12.866
cmgj0umjl003brchsec656xt5	cmgj0q4k3000prchs0wrob14j	9	1	1	2025-10-09 06:13:33.728
cmgj0v2zz003lrchscecxnq7o	cmgj0q4k3000prchs0wrob14j	10	1	2	2025-10-09 06:13:55.054
cmgj0wvhq003vrchsdlm0yjp3	cmgj0q4k3000prchs0wrob14j	11	2	2	2025-10-09 06:15:18.637
cmgj0xc310045rchsoqjgmai5	cmgj0q4k3000prchs0wrob14j	12	2	2	2025-10-09 06:15:40.14
cmgj0xt03004frchspm2xx8dr	cmgj0q4k3000prchs0wrob14j	13	2	3	2025-10-09 06:16:02.067
\.


--
-- Data for Name: TrickCard; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."TrickCard" (id, "trickId", "seatIndex", suit, rank, "playOrder", "playedAt") FROM stdin;
cmgj0qtlw0015rchsm2i1bzom	cmgj0qr5b0013rchsxq7vbupg	1	CLUBS	2	1	2025-10-09 06:10:36.259
cmgj0qxxp0017rchs5fnayr5j	cmgj0qr5b0013rchsxq7vbupg	2	HEARTS	4	2	2025-10-09 06:10:41.868
cmgj0r1wg0019rchsn6wce06r	cmgj0qr5b0013rchsxq7vbupg	3	CLUBS	4	3	2025-10-09 06:10:47.008
cmgj0r5x6001brchs7bbl8kzr	cmgj0qr5b0013rchsxq7vbupg	0	CLUBS	7	4	2025-10-09 06:10:52.217
cmgj0rdox001frchs6wpc982m	cmgj0rajf001drchsqpo2gfy1	0	DIAMONDS	5	1	2025-10-09 06:11:02.288
cmgj0rh3b001hrchse9he7lmp	cmgj0rajf001drchsqpo2gfy1	1	DIAMONDS	2	2	2025-10-09 06:11:06.694
cmgj0rke0001jrchsoeozf1oz	cmgj0rajf001drchsqpo2gfy1	2	DIAMONDS	4	3	2025-10-09 06:11:10.967
cmgj0rnp1001lrchsry2svju7	cmgj0rajf001drchsqpo2gfy1	3	DIAMONDS	9	4	2025-10-09 06:11:15.252
cmgj0rtuu001prchs2jz97cuh	cmgj0rr19001nrchsjsv48c5i	3	HEARTS	2	1	2025-10-09 06:11:23.237
cmgj0rx8y001rrchs0q2t7h0a	cmgj0rr19001nrchsjsv48c5i	0	HEARTS	K	2	2025-10-09 06:11:27.633
cmgj0s0ih001trchs81j6vkc4	cmgj0rr19001nrchsjsv48c5i	1	HEARTS	6	3	2025-10-09 06:11:31.864
cmgj0s3wc001vrchsndwfldgx	cmgj0rr19001nrchsjsv48c5i	2	HEARTS	5	4	2025-10-09 06:11:36.252
cmgj0sae9001zrchs5yv3b0q8	cmgj0s7k1001xrchs75gymovs	0	CLUBS	K	1	2025-10-09 06:11:44.673
cmgj0sdvz0021rchs36yhoccq	cmgj0s7k1001xrchs75gymovs	1	CLUBS	5	2	2025-10-09 06:11:49.198
cmgj0sh630023rchsg6baw99r	cmgj0s7k1001xrchs75gymovs	2	DIAMONDS	6	3	2025-10-09 06:11:53.45
cmgj0skg50025rchscujmx5o8	cmgj0s7k1001xrchs75gymovs	3	CLUBS	6	4	2025-10-09 06:11:57.7
cmgj0srs60029rchsd6sid8r1	cmgj0sns70027rchs3a1zfu84	0	CLUBS	Q	1	2025-10-09 06:12:07.205
cmgj0sx0v002brchsoh07mks7	cmgj0sns70027rchs3a1zfu84	1	CLUBS	10	2	2025-10-09 06:12:13.998
cmgj0t0b5002drchs4fwjz185	cmgj0sns70027rchs3a1zfu84	2	SPADES	6	3	2025-10-09 06:12:18.256
cmgj0t3po002frchst6cf8r7s	cmgj0sns70027rchs3a1zfu84	3	SPADES	2	4	2025-10-09 06:12:22.668
cmgj0tar4002jrchsm9j8tkf1	cmgj0t7pu002hrchsr065hcvd	2	HEARTS	8	1	2025-10-09 06:12:31.791
cmgj0tea6002lrchstyovtem6	cmgj0t7pu002hrchsr065hcvd	3	HEARTS	3	2	2025-10-09 06:12:36.364
cmgj0thob002nrchsdzbe91iu	cmgj0t7pu002hrchsr065hcvd	0	SPADES	5	3	2025-10-09 06:12:40.762
cmgj0tkye002prchs28nkfh5m	cmgj0t7pu002hrchsr065hcvd	1	HEARTS	7	4	2025-10-09 06:12:45.013
cmgj0ts84002trchsc3v4r8bh	cmgj0toa6002rrchspx8tqbms	0	SPADES	Q	1	2025-10-09 06:12:54.435
cmgj0twjb002vrchsvrsbruj2	cmgj0toa6002rrchspx8tqbms	1	SPADES	4	2	2025-10-09 06:13:00.022
cmgj0tztr002xrchs36hctkjx	cmgj0toa6002rrchspx8tqbms	2	SPADES	9	3	2025-10-09 06:13:04.286
cmgj0u347002zrchsmyc7isk9	cmgj0toa6002rrchspx8tqbms	3	SPADES	8	4	2025-10-09 06:13:08.55
cmgj0u98e0033rchsmfz9j5ya	cmgj0u6g30031rchsiu7r0opw	0	DIAMONDS	8	1	2025-10-09 06:13:16.477
cmgj0ucmf0035rchsr3vr7ddy	cmgj0u6g30031rchsiu7r0opw	1	DIAMONDS	A	2	2025-10-09 06:13:20.87
cmgj0ufwq0037rchs3zuxru1o	cmgj0u6g30031rchsiu7r0opw	2	DIAMONDS	7	3	2025-10-09 06:13:25.129
cmgj0uj7h0039rchspcjupry4	cmgj0u6g30031rchsiu7r0opw	3	DIAMONDS	10	4	2025-10-09 06:13:29.404
cmgj0upcz003drchs8y17yoc6	cmgj0umjl003brchsec656xt5	1	CLUBS	J	1	2025-10-09 06:13:37.378
cmgj0usvj003frchsoq58y8bx	cmgj0umjl003brchsec656xt5	2	HEARTS	Q	2	2025-10-09 06:13:41.935
cmgj0uw5u003hrchs0guqr5mo	cmgj0umjl003brchsec656xt5	3	HEARTS	10	3	2025-10-09 06:13:46.193
cmgj0uzbs003jrchs6lprad1e	cmgj0umjl003brchsec656xt5	0	CLUBS	3	4	2025-10-09 06:13:50.295
cmgj0v5t8003nrchsozb6nj1v	cmgj0v2zz003lrchscecxnq7o	1	SPADES	7	1	2025-10-09 06:13:58.699
cmgj0v97v003prchsud4y43b9	cmgj0v2zz003lrchscecxnq7o	2	SPADES	K	2	2025-10-09 06:14:03.114
cmgj0vcie003rrchs18fsfrh8	cmgj0v2zz003lrchscecxnq7o	3	SPADES	J	3	2025-10-09 06:14:07.381
cmgj0ws63003trchs3ah7v7v2	cmgj0v2zz003lrchscecxnq7o	0	SPADES	3	4	2025-10-09 06:15:14.33
cmgj0wyb3003xrchs7wfz0n0n	cmgj0wvhq003vrchsdlm0yjp3	2	SPADES	A	1	2025-10-09 06:15:22.285
cmgj0x1pt003zrchsbjuf1qiq	cmgj0wvhq003vrchsdlm0yjp3	3	DIAMONDS	J	2	2025-10-09 06:15:26.704
cmgj0x5hb0041rchsv5gvx4rs	cmgj0wvhq003vrchsdlm0yjp3	0	CLUBS	9	3	2025-10-09 06:15:31.582
cmgj0x8re0043rchszsv3ib6e	cmgj0wvhq003vrchsdlm0yjp3	1	SPADES	10	4	2025-10-09 06:15:35.834
cmgj0xf090047rchs40s29zs3	cmgj0xc310045rchsoqjgmai5	2	HEARTS	A	1	2025-10-09 06:15:43.928
cmgj0xif20049rchsa8urbxme	cmgj0xc310045rchsoqjgmai5	3	HEARTS	J	2	2025-10-09 06:15:48.349
cmgj0xmen004brchsqhvbeqzo	cmgj0xc310045rchsoqjgmai5	0	CLUBS	8	3	2025-10-09 06:15:53.518
cmgj0xpou004drchsyzjr14dy	cmgj0xc310045rchsoqjgmai5	1	HEARTS	9	4	2025-10-09 06:15:57.773
cmgj0xvtl004hrchslf7kc2vz	cmgj0xt03004frchspm2xx8dr	2	DIAMONDS	Q	1	2025-10-09 06:16:05.72
cmgj0xz85004jrchsc7i6ngv6	cmgj0xt03004frchspm2xx8dr	3	DIAMONDS	K	2	2025-10-09 06:16:10.132
cmgj0y3c5004lrchsl0tf8k3o	cmgj0xt03004frchspm2xx8dr	0	DIAMONDS	3	3	2025-10-09 06:16:15.311
cmgj0y6mj004nrchslitdfgve	cmgj0xt03004frchspm2xx8dr	1	CLUBS	A	4	2025-10-09 06:16:19.722
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."User" (id, "discordId", username, "avatarUrl", "createdAt", coins, "soundEnabled") FROM stdin;
user_1756353466780_9g9m40xew	user_1756353466780_9g9m40xew	Tom [BUX$DAO]	\N	2025-10-09 06:00:43.12	0	t
user_1757268612193_b3vfcd8ru	1414308647323963533	Lisa	https://cdn.discordapp.com/avatars/1414308647323963533/0ad725187ce7e4df70aea0302f97b5c0.png	2025-09-07 18:10:12.193	10000000	t
cmefuocj800kxv9yeav16azg6	1403863570415882382	Eddie XNB	https://cdn.discordapp.com/avatars/1403863570415882382/fe167da725ea69a6336a280f7097f2f0.png	2025-08-17 15:37:59.925	10000000	t
cmejhlzzc0000x01kmh8iokih	901733669335621653	Lynnsanity	https://cdn.discordapp.com/avatars/901733669335621653/da6dac1f369cf816d6bc976f00979bc9.png	2025-08-20 04:43:20.04	10000000	t
user_1758307698808_b53ag8s5f	1416410253339131944	Wanda	https://cdn.discordapp.com/avatars/1416410253339131944/69de73d6e8db1b7a8bb84f4f3e1a2675.png	2025-09-19 18:48:18.808	10000000	t
user_1757792110705_5dgdzrewp	1416408398383022281	GHalso	https://cdn.discordapp.com/avatars/1416408398383022281/ac99d2b18168f78ca7adcaa6d87793dc.png	2025-09-13 19:35:10.704	10000000	t
user_1756340694873_oq0djepnu	1408614703718207519	Anita	https://cdn.discordapp.com/avatars/1408614703718207519/5dc3889c1020212bc6f50f43e6639699.png	2025-08-28 00:24:54.873	11160000	t
user_1757771662780_d2kw3pj67	1415469308737487100	Queen Tasha	https://cdn.discordapp.com/avatars/1415469308737487100/01b515f19216955842fef1b3a182448c.png	2025-09-13 13:54:22.78	10000000	t
cmeczsb140014p8mies39dbt3	1405932568775491594	Sam	https://cdn.discordapp.com/avatars/1405932568775491594/8569adcbd36c70a7578c017bf5604ea5.png	2025-08-15 15:37:44.153	10000000	t
user_1756489263747_a4zc2zfed	1048698641755414610	BrandiLynn	https://cdn.discordapp.com/avatars/1048698641755414610/2ab0058f9963af59b44dca0ffb4c9ad8.png	2025-08-29 17:41:03.747	10000000	t
user_1757701398663_lik9clcow	1415866820379938887	Trucker_Mum	https://cdn.discordapp.com/avatars/1415866820379938887/e959c137a3875b7eb3ab8d69294ef1fe.png	2025-09-12 18:23:18.663	10000000	t
user_1757557480936_jtlrwme3c	1415521175521595542	LaraJane	https://cdn.discordapp.com/avatars/1415521175521595542/8569adcbd36c70a7578c017bf5604ea5.png	2025-09-11 02:24:40.936	10000000	t
cmervaobj0003krk7msha13vm	1409709790640472125	Karen U 🤪	https://cdn.discordapp.com/avatars/1409709790640472125/c66d5e86b4066751c3b502f8fea4b740.png	2025-08-26 01:28:35.744	10000000	t
user_1756947441839_lj7h599uu	1412945794511667272	Holly Steele	https://cdn.discordapp.com/avatars/1412945794511667272/c82b3fa769ed6e6ffdea579381ed5f5c.png	2025-09-04 00:57:21.839	10000000	t
cmeuj8j5001v9xq2euwknxz2r	1410385733419536457	Amy	/default-pfp.jpg	2025-08-27 22:14:18.852	10000000	t
user_1756591409813_rb94largi	1061748012759650425	Sandy M	https://cdn.discordapp.com/avatars/1061748012759650425/213c74cf100cb7727806b88e0d377cfa.png	2025-08-30 22:03:29.813	15000000	t
user_1757868021372_iezuotbov	1416610000582869013	Vegasbrey	https://cdn.discordapp.com/avatars/1416610000582869013/c82b3fa769ed6e6ffdea579381ed5f5c.png	2025-09-14 16:40:21.372	10000000	t
cme8w05ct000083p8y1emwk38	1403084265708589156	Gail	https://cdn.discordapp.com/avatars/1403084265708589156/974003552e47b683a71251f1fe2d90d9.png	2025-08-12 18:40:46.878	10000000	t
user_1757686805248_eip9xt6ka	1416056395090100245	Big Momma Snickers	/default-pfp.jpg	2025-09-12 14:20:05.248	10000000	t
user_1757527136930_fdacrk0ap	1415389304087249000	WarriorSue	https://cdn.discordapp.com/avatars/1415389304087249000/8569adcbd36c70a7578c017bf5604ea5.png	2025-09-10 17:58:56.93	10000000	t
cme8x5vnx00043q059ay59zhu	788862954731995206	JOSH T.	https://cdn.discordapp.com/avatars/788862954731995206/87a12069c0e7fe464f6ddc279471849f.png	2025-08-12 19:13:13.87	10000000	t
user_1757281051992_flt8q8juo	1414319061503967353	Mziindiia	https://cdn.discordapp.com/avatars/1414319061503967353/eab5584f8813e3fca755b84c4092f196.png	2025-09-07 21:37:31.992	10000000	t
cmeoh9akw00ek5vv5nzcmsodb	893900456856805386	VenomVengeance	https://cdn.discordapp.com/avatars/893900456856805386/86918a5e8ec07c5f1289edfd85a78eab.png	2025-08-23 16:32:18.129	15000000	t
cme8sxzbj000b14p861bs8ou4	1315774796017176636	GEM	https://cdn.discordapp.com/avatars/1315774796017176636/4d47278a9ae2d4bd50b0c0c0f8b8c84f.png	2025-08-12 17:15:06.895	15000000	t
user_1757632696398_o6iknrjw2	795747295177605130	yadidatida	/default-pfp.jpg	2025-09-11 23:18:16.398	10000000	t
cme99rv1v0000gx2y3a6hvbmx	1062488403821731861	RobinRed2	https://cdn.discordapp.com/avatars/1062488403821731861/5445ffd7ffb201a98393cbdf684ea4b1.png	2025-08-13 01:06:14.9	10000000	t
user_1756948176758_zibv62sj2	1409598787579805839	DaMobYLRell	https://cdn.discordapp.com/avatars/1409598787579805839/f7f2e9361e8a54ce6e72580ac7b967af.png	2025-09-04 01:09:36.758	10000000	t
cme92abcp0000xsukar4v59pt	1062509618481344613	DRChica	https://cdn.discordapp.com/avatars/1062509618481344613/df890cbd5699340ad4134099974b8e8d.png	2025-08-12 21:36:38.905	10000000	t
cmeh82anp00xyv9yen7bf3vni	734542056390787112	Professor	https://cdn.discordapp.com/avatars/734542056390787112/e94fbcf29e51f014851660cc7db5b644.png	2025-08-18 14:40:31.861	10000000	t
cmehf95l500y5v9yea8ma788e	435331849972219904	Guava [BUX$DAO]	https://cdn.discordapp.com/avatars/435331849972219904/fef7410c8aa61294b18279ed93c991e7.png	2025-08-18 18:01:49.194	10000000	t
cme8sw3nv000314p8llo0smff	577901812246511637	MFSassy	https://cdn.discordapp.com/avatars/577901812246511637/428cb869c29cfa0513e697c7788b65f4.png	2025-08-12 17:13:39.211	15000000	t
cmgj0q2km000frchsu4kttcp0	bot_1_1759990201069	Bot_bot_1_1759990201069	https://api.dicebear.com/7.x/bottts/svg?seed=bob	2025-10-09 06:10:01.222	1000000	f
cmed2cnw0003q13okshe5sm9w	986969217024794674	lorigirl	https://cdn.discordapp.com/avatars/986969217024794674/d8a00615e5a7e8656bdccf3401a31840.png	2025-08-15 16:49:33.169	10160000	t
user_1757717972265_v5ykvtepz	1002677465308745758	GeneGuy2023 | THC Labz | DeGods	https://cdn.discordapp.com/avatars/1002677465308745758/8eedac9e649001debaeaa07a014054f9.png	2025-09-12 22:59:32.265	10000000	t
cme8sw3zz000614p8mp1mzbag	1400546525951824024	Will2828	https://cdn.discordapp.com/avatars/1400546525951824024/230e3736be42fa4d7dbdea06ee54fdba.png	2025-08-12 17:13:39.648	15000000	t
cmgj0q2q0000jrchs5jzhsuea	bot_3_1759990201070	Bot_bot_3_1759990201070	https://api.dicebear.com/7.x/bottts/svg?seed=diana	2025-10-09 06:10:01.376	1000000	f
cme8sw339000014p8j5ob6bh7	1195400053964161055	Nichole	https://cdn.discordapp.com/avatars/1195400053964161055/671157f8a0220c65f134fb0a12332c52.png	2025-08-12 17:13:38.47	15000000	t
cme97k7iz0064al60lhmhvicw	1400642337977143337	Jenn🩷	https://cdn.discordapp.com/avatars/1400642337977143337/832571a5b1c617dbe0cccd335305af3b.png	2025-08-13 00:04:18.587	10000000	t
cme90quhl0003613vw4mu0c6i	290531269970755587	Gob1	https://cdn.discordapp.com/avatars/290531269970755587/a_eb69b31fe5007dfc0edb5a9a7079dd78.png	2025-08-12 20:53:30.97	10000000	t
cmeldrfox00005u7rkabojtcd	1407801873213292726	RobinH.	https://cdn.discordapp.com/avatars/1407801873213292726/f2f4d9521ff867baf4c2fb65b7504d0d.png	2025-08-21 12:31:07.569	15000000	t
cmet7u1vg00ca12n43rweewxq	1410044795375587371	Nicole0422	https://cdn.discordapp.com/avatars/1410044795375587371/34649642bc3df1e343c9db2f7fd8f475.png	2025-08-27 00:07:21.341	10000000	t
cmet096ge0000y1yvvcsz3qm7	1409711239210467519	Ellen	https://cdn.discordapp.com/avatars/1409711239210467519/11b609e0527217cf138700dfc08afa09.png	2025-08-26 20:35:10.19	10000000	t
user_1757084620583_gwmkb3ttc	1411819080985350155	Pamela	https://cdn.discordapp.com/avatars/1411819080985350155/d0df8d3dadd35670af43b21789527829.png	2025-09-05 15:03:40.583	10000000	t
cme9k0isv000olqk54zt6ookh	1259605331730759770	Amber Weston	https://cdn.discordapp.com/avatars/1259605331730759770/079c58d1eaa1a15f89927955d329f324.png	2025-08-13 05:52:55.088	10140000	t
cmgj07tmh00030zgi3o8xrvwy	931160720261939230	Tom [BUX$DAO]	https://cdn.discordapp.com/avatars/931160720261939230/466fdbd1139841df66248cc8aebce68e.png	2025-10-09 05:55:49.816	15000000	t
cmetelokc00z112n46dt7sv3t	1243622348909969510	pinkpepper1965	https://cdn.discordapp.com/avatars/1243622348909969510/f7f2e9361e8a54ce6e72580ac7b967af.png	2025-08-27 03:16:48.156	10000000	t
cme8t9p1e0000tfu44l4no4ty	1400602664437415956	ChosenWon	https://cdn.discordapp.com/avatars/1400602664437415956/b68c4ddbbd820f2ee51928d4c681fd3e.png	2025-08-12 17:24:13.443	10000000	t
cmefzqiup00t0v9yep9lrmmvk	1302811669252014163	SandyRM	https://cdn.discordapp.com/avatars/1302811669252014163/dc6682ce244a57a09cb2800e3438021c.png	2025-08-17 17:59:39.505	10000000	t
cmekciote0007h1laeibqj8cu	408330021267308565	Helipos	https://cdn.discordapp.com/avatars/408330021267308565/3fec3c956a70d37b840e28dc2e6540de.png	2025-08-20 19:08:33.699	10000000	t
cmennilkd0000golvg384s0oj	1406105854431854732	Dannielle S	https://cdn.discordapp.com/avatars/1406105854431854732/128dfeeaa26f305cddd155e0f7ebbd29.png	2025-08-23 02:39:43.789	10000000	t
cmeqgq73n02kf39t5ijzp09n9	1403111759086354432	Jennifer	https://cdn.discordapp.com/avatars/1403111759086354432/656220b0bc13317d493351186b19df71.png	2025-08-25 01:52:59.508	16660000	t
user_1757710584128_ab1ebkxga	1415913664711626802	Cassybel	https://cdn.discordapp.com/avatars/1415913664711626802/6608ab0e2ae0d9aa10e1ba283f32ddc0.png	2025-09-12 20:56:24.128	10000000	t
cmgj0q2ov000irchsgpokbny7	bot_2_1759990201070	Bot_bot_2_1759990201070	https://api.dicebear.com/7.x/bottts/svg?seed=charlie	2025-10-09 06:10:01.376	1000000	f
cmeeo3s9s000av9ye52y13xqm	1406360032559235205	Tom	https://cdn.discordapp.com/avatars/1406360032559235205/96e6f21b9548cd51086d0518ab8b4bfa.png	2025-08-16 19:46:16.672	10000000	t
\.


--
-- Data for Name: UserStats; Type: TABLE DATA; Schema: public; Owner: spades_owner
--

COPY public."UserStats" (id, "userId", "totalGamesPlayed", "totalGamesWon", "totalWinPct", "totalBags", "totalBagsPerGame", "totalNilsBid", "totalNilsMade", "totalNilPct", "totalBlindNilsBid", "totalBlindNilsMade", "totalBlindNilPct", "totalRegularPlayed", "totalRegularWon", "totalRegularWinPct", "totalWhizPlayed", "totalWhizWon", "totalWhizWinPct", "totalMirrorPlayed", "totalMirrorWon", "totalMirrorWinPct", "totalGimmickPlayed", "totalGimmickWon", "totalGimmickWinPct", "totalScreamerPlayed", "totalScreamerWon", "totalScreamerWinPct", "totalAssassinPlayed", "totalAssassinWon", "totalAssassinWinPct", "leagueGamesPlayed", "leagueGamesWon", "leagueWinPct", "leagueBags", "leagueBagsPerGame", "leagueNilsBid", "leagueNilsMade", "leagueNilPct", "leagueBlindNilsBid", "leagueBlindNilsMade", "leagueBlindNilPct", "leagueRegularPlayed", "leagueRegularWon", "leagueRegularWinPct", "leagueWhizPlayed", "leagueWhizWon", "leagueWhizWinPct", "leagueMirrorPlayed", "leagueMirrorWon", "leagueMirrorWinPct", "leagueGimmickPlayed", "leagueGimmickWon", "leagueGimmickWinPct", "leagueScreamerPlayed", "leagueScreamerWon", "leagueScreamerWinPct", "leagueAssassinPlayed", "leagueAssassinWon", "leagueAssassinWinPct", "partnersGamesPlayed", "partnersGamesWon", "partnersWinPct", "partnersBags", "partnersBagsPerGame", "partnersNilsBid", "partnersNilsMade", "partnersNilPct", "partnersBlindNilsBid", "partnersBlindNilsMade", "partnersBlindNilPct", "partnersRegularPlayed", "partnersRegularWon", "partnersRegularWinPct", "partnersWhizPlayed", "partnersWhizWon", "partnersWhizWinPct", "partnersMirrorPlayed", "partnersMirrorWon", "partnersMirrorWinPct", "partnersGimmickPlayed", "partnersGimmickWon", "partnersGimmickWinPct", "partnersScreamerPlayed", "partnersScreamerWon", "partnersScreamerWinPct", "partnersAssassinPlayed", "partnersAssassinWon", "partnersAssassinWinPct", "soloGamesPlayed", "soloGamesWon", "soloWinPct", "soloBags", "soloBagsPerGame", "soloNilsBid", "soloNilsMade", "soloNilPct", "soloBlindNilsBid", "soloBlindNilsMade", "soloBlindNilPct", "soloRegularPlayed", "soloRegularWon", "soloRegularWinPct", "soloWhizPlayed", "soloWhizWon", "soloWhizWinPct", "soloMirrorPlayed", "soloMirrorWon", "soloMirrorWinPct", "soloGimmickPlayed", "soloGimmickWon", "soloGimmickWinPct", "soloScreamerPlayed", "soloScreamerWon", "soloScreamerWinPct", "soloAssassinPlayed", "soloAssassinWon", "soloAssassinWinPct", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Name: BlockedUser BlockedUser_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."BlockedUser"
    ADD CONSTRAINT "BlockedUser_pkey" PRIMARY KEY (id);


--
-- Name: EventGame EventGame_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."EventGame"
    ADD CONSTRAINT "EventGame_pkey" PRIMARY KEY ("eventId", "gameId");


--
-- Name: Event Event_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_pkey" PRIMARY KEY (id);


--
-- Name: Friend Friend_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."Friend"
    ADD CONSTRAINT "Friend_pkey" PRIMARY KEY (id);


--
-- Name: GamePlayer GamePlayer_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."GamePlayer"
    ADD CONSTRAINT "GamePlayer_pkey" PRIMARY KEY (id);


--
-- Name: GameResult GameResult_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."GameResult"
    ADD CONSTRAINT "GameResult_pkey" PRIMARY KEY (id);


--
-- Name: Game Game_reordered_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."Game"
    ADD CONSTRAINT "Game_reordered_pkey" PRIMARY KEY (id);


--
-- Name: PlayerRoundStats PlayerRoundStats_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."PlayerRoundStats"
    ADD CONSTRAINT "PlayerRoundStats_pkey" PRIMARY KEY (id);


--
-- Name: RoundHandSnapshot RoundHandSnapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."RoundHandSnapshot"
    ADD CONSTRAINT "RoundHandSnapshot_pkey" PRIMARY KEY (id);


--
-- Name: RoundScore RoundScore_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."RoundScore"
    ADD CONSTRAINT "RoundScore_pkey" PRIMARY KEY (id);


--
-- Name: Round Round_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."Round"
    ADD CONSTRAINT "Round_pkey" PRIMARY KEY (id);


--
-- Name: TrickCard TrickCard_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."TrickCard"
    ADD CONSTRAINT "TrickCard_pkey" PRIMARY KEY (id);


--
-- Name: Trick Trick_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."Trick"
    ADD CONSTRAINT "Trick_pkey" PRIMARY KEY (id);


--
-- Name: UserStats UserStats_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."UserStats"
    ADD CONSTRAINT "UserStats_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: BlockedUser_userId_blockedId_key; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE UNIQUE INDEX "BlockedUser_userId_blockedId_key" ON public."BlockedUser" USING btree ("userId", "blockedId");


--
-- Name: EventGame_gameId_idx; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE INDEX "EventGame_gameId_idx" ON public."EventGame" USING btree ("gameId");


--
-- Name: Friend_userId_friendId_key; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE UNIQUE INDEX "Friend_userId_friendId_key" ON public."Friend" USING btree ("userId", "friendId");


--
-- Name: GamePlayer_gameId_seatIndex_key; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE UNIQUE INDEX "GamePlayer_gameId_seatIndex_key" ON public."GamePlayer" USING btree ("gameId", "seatIndex");


--
-- Name: GamePlayer_userId_idx; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE INDEX "GamePlayer_userId_idx" ON public."GamePlayer" USING btree ("userId");


--
-- Name: GameResult_gameId_key; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE UNIQUE INDEX "GameResult_gameId_key" ON public."GameResult" USING btree ("gameId");


--
-- Name: PlayerRoundStats_roundId_userId_key; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE UNIQUE INDEX "PlayerRoundStats_roundId_userId_key" ON public."PlayerRoundStats" USING btree ("roundId", "userId");


--
-- Name: PlayerRoundStats_userId_idx; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE INDEX "PlayerRoundStats_userId_idx" ON public."PlayerRoundStats" USING btree ("userId");


--
-- Name: RoundHandSnapshot_roundId_seatIndex_idx; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE INDEX "RoundHandSnapshot_roundId_seatIndex_idx" ON public."RoundHandSnapshot" USING btree ("roundId", "seatIndex");


--
-- Name: RoundScore_roundId_key; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE UNIQUE INDEX "RoundScore_roundId_key" ON public."RoundScore" USING btree ("roundId");


--
-- Name: Round_gameId_idx; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE INDEX "Round_gameId_idx" ON public."Round" USING btree ("gameId");


--
-- Name: Round_gameId_roundNumber_key; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE UNIQUE INDEX "Round_gameId_roundNumber_key" ON public."Round" USING btree ("gameId", "roundNumber");


--
-- Name: TrickCard_trickId_idx; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE INDEX "TrickCard_trickId_idx" ON public."TrickCard" USING btree ("trickId");


--
-- Name: TrickCard_trickId_playOrder_key; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE UNIQUE INDEX "TrickCard_trickId_playOrder_key" ON public."TrickCard" USING btree ("trickId", "playOrder");


--
-- Name: Trick_roundId_idx; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE INDEX "Trick_roundId_idx" ON public."Trick" USING btree ("roundId");


--
-- Name: Trick_roundId_trickNumber_key; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE UNIQUE INDEX "Trick_roundId_trickNumber_key" ON public."Trick" USING btree ("roundId", "trickNumber");


--
-- Name: UserStats_userId_key; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE UNIQUE INDEX "UserStats_userId_key" ON public."UserStats" USING btree ("userId");


--
-- Name: User_discordId_key; Type: INDEX; Schema: public; Owner: spades_owner
--

CREATE UNIQUE INDEX "User_discordId_key" ON public."User" USING btree ("discordId");


--
-- Name: Game game_status_change_trigger; Type: TRIGGER; Schema: public; Owner: spades_owner
--

CREATE TRIGGER game_status_change_trigger BEFORE UPDATE ON public."Game" FOR EACH ROW EXECUTE FUNCTION public.log_game_status_change();


--
-- Name: BlockedUser BlockedUser_blockedId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."BlockedUser"
    ADD CONSTRAINT "BlockedUser_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: BlockedUser BlockedUser_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."BlockedUser"
    ADD CONSTRAINT "BlockedUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: EventGame EventGame_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."EventGame"
    ADD CONSTRAINT "EventGame_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: EventGame EventGame_gameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."EventGame"
    ADD CONSTRAINT "EventGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES public."Game"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Friend Friend_friendId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."Friend"
    ADD CONSTRAINT "Friend_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Friend Friend_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."Friend"
    ADD CONSTRAINT "Friend_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GamePlayer GamePlayer_gameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."GamePlayer"
    ADD CONSTRAINT "GamePlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES public."Game"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GamePlayer GamePlayer_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."GamePlayer"
    ADD CONSTRAINT "GamePlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GameResult GameResult_gameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."GameResult"
    ADD CONSTRAINT "GameResult_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES public."Game"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PlayerRoundStats PlayerRoundStats_roundId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."PlayerRoundStats"
    ADD CONSTRAINT "PlayerRoundStats_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES public."Round"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PlayerRoundStats PlayerRoundStats_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."PlayerRoundStats"
    ADD CONSTRAINT "PlayerRoundStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: RoundHandSnapshot RoundHandSnapshot_roundId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."RoundHandSnapshot"
    ADD CONSTRAINT "RoundHandSnapshot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES public."Round"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: RoundScore RoundScore_roundId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."RoundScore"
    ADD CONSTRAINT "RoundScore_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES public."Round"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Round Round_gameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."Round"
    ADD CONSTRAINT "Round_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES public."Game"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TrickCard TrickCard_trickId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."TrickCard"
    ADD CONSTRAINT "TrickCard_trickId_fkey" FOREIGN KEY ("trickId") REFERENCES public."Trick"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Trick Trick_roundId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: spades_owner
--

ALTER TABLE ONLY public."Trick"
    ADD CONSTRAINT "Trick_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES public."Round"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: spades_owner
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

