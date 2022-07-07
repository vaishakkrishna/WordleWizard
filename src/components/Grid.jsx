import WordRow from "./WordRow";
import "./Grid.css";
import React, { useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import {
	isAlphabetic,
	generateEmptyBoard,
	isValidWord,
	SolutionSetAfterGuess,
} from "../utilities/stringUtils";

import { allWordsList, allSolutionsList } from "../utilities/wordLists";
import {
	patternOfWordGivenSolution,
	getEntropy,
} from "../utilities/solverUtils";
import WorkerBuilder from "../utilities/worker/worker-builder";
import Worker from "../utilities/worker/guess-generate-worker";
import { getSolutionFromOffset } from "../utilities/gameStateUtils";

function Grid(props) {
	// WebWorker
	const myWorker = new WorkerBuilder(Worker);

	/**
	 * STATE VARIABLES
	 **/
	const [currentActiveWordRow, setCurrentActiveWordRow] = useState(0);
	const [currentActiveLetter, setCurrentActiveLetter] = useState(0);
	const [wordRows, setWordRows] = useState(
		generateEmptyBoard(parseInt(props.width), parseInt(props.height))
	);
	const [colorRows, setColorRows] = useState(
		generateEmptyBoard(parseInt(props.width), parseInt(props.height))
	);
	const [solved, setSolved] = useState(false);
	const [solutionSet, setSolutionSet] = useState([...allSolutionsList]);
	const [isComputing, setIsComputing] = useState(false);
	const [syncWithWordle, setSyncWithWordle] = useState(false);
	const [skillScores, setSkillScores] = useState([]);
	const [backgroundComputing, setBackgroundComputing] = useState(false);
	//in the form [[solutionSet, rowToCalculate]...]
	const [workerStack, setWorkerStack] = useState([]);
	const [solution, setSolution] = useState(
		props.type === "freeplay"
			? randomElementFromArray(allSolutionsList)
			: getSolutionFromOffset()
	);

	// in the form [["crane", 5.43, 1.23], ["louts", 6.23, 0.34]...]
	const [optimalGuesses, setOptimalGuesses] = useState([
		["TRACE", 5.75, 0],
		["", 0, 0],
		["", 0, 0],
		["", 0, 0],
		["", 0, 0],
		["", 0, 0],
	]);

	/**
	 * HELPER FUNCTIONS FOR KEY PRESSES AND API CALLS
	 **/
	const fillInWord = (wordAsString) => {
		if (currentActiveWordRow >= wordRows.length) {
			console.log("Attempting to fill in word after end of grid!");
			return;
		}
		const newWordRows = JSON.parse(JSON.stringify(wordRows));
		newWordRows[currentActiveWordRow] = wordAsString.split("");
		setWordRows(newWordRows);
		setCurrentActiveWordRow(currentActiveWordRow + 1);
	};

	// function to fill in current letter
	const fillInLetter = (letter) => {
		const newWordRows = JSON.parse(JSON.stringify(wordRows));
		newWordRows[currentActiveWordRow][currentActiveLetter] =
			letter.toUpperCase();
		setCurrentActiveLetter(currentActiveLetter + 1);
		setWordRows(newWordRows);
	};

	// Fills in colors of the previous row when it was completed
	const updateCompletedRow = () => {
		const newColorRows = JSON.parse(JSON.stringify(colorRows));
		const updateFunction = (colors) => {
			if (colors === "ggggg") {
				setSolved(true);
			}
			newColorRows[currentActiveWordRow - 1] = colors.split("");
			// Sets colors of prev. row
			setColorRows(newColorRows);

			// Computes and sets the new solution set
			const newSolSet = SolutionSetAfterGuess(
				solutionSet,
				wordRows[currentActiveWordRow - 1].join(""),
				newColorRows[currentActiveWordRow - 1].join("")
			);
			console.log(newSolSet);

			// Computes and sets the skill scores
			const newSkillScores = [...skillScores];

			const bestEntropy = optimalGuesses[currentActiveWordRow - 1][1];

			const worstEntropy = optimalGuesses[currentActiveWordRow - 1][2];

			const actualEntropy = getEntropy(
				wordRows[currentActiveWordRow - 1].join("").toLowerCase(),
				solutionSet
			);
			const skillScore =
				bestEntropy === 0
					? 100
					: Math.round(
							((actualEntropy - worstEntropy) / (bestEntropy - worstEntropy)) *
								100
					  );
			newSkillScores[currentActiveWordRow - 1] = skillScore;
			setSkillScores(newSkillScores);

			// figure out the next best guess in the background
			if (optimalGuesses[currentActiveWordRow][0] === "") {
				console.log("Computing next best guess");
				const newWS = [...workerStack];
				newWS.push([newSolSet, currentActiveWordRow]);
				setWorkerStack(newWS);
			}
			setSolutionSet(newSolSet);
		};
		const word = wordRows[currentActiveWordRow - 1].join("").toLowerCase();
		const colors = patternOfWordGivenSolution(word, solution).toLowerCase();
		updateFunction(colors);
	};

	const deleteLastLetter = () => {
		if (currentActiveLetter > 0) {
			const newWordRows = JSON.parse(JSON.stringify(wordRows));
			newWordRows[currentActiveWordRow][currentActiveLetter - 1] = "-";
			setCurrentActiveLetter(currentActiveLetter - 1);
			setWordRows(newWordRows);
		}
	};

	//Handle button presses for next guess
	function handleNextGuessClicked(e) {
		if (solved) {
			alert("You have already solved this puzzle!");
			return;
		}
		if (isComputing) {
			alert("Please wait for the solver to finish computing!");
			return;
		}
		// Worker has computed the next best guess
		if (optimalGuesses[currentActiveWordRow][0] !== "") {
			// fill in word
			console.log(optimalGuesses[currentActiveWordRow[0]]);
			fillInWord(optimalGuesses[currentActiveWordRow][0]);
			return;
		}
		// Worker is computing the next best guess
		setIsComputing(true);
	}

	function handleShareClicked(e) {
		var shareText = "Wordle 001: " + currentActiveWordRow.toString() + "/6\n";
		for (var i = 0; i < colorRows.length; i++) {
			for (var j = 0; j < colorRows[i].length; j++) {
				switch (colorRows[i][j]) {
					case "g":
						shareText += "🟩";
						break;
					case "r":
						shareText += "⬜️";
						break;
					case "y":
						shareText += "🟨";
						break;
					default:
						shareText += "";
				}
			}
			shareText += "\n";
		}
		navigator.clipboard.writeText(shareText);
	}

	// Handle Key presses
	const keyDownHandler = (event) => {
		if (!solved) {
			// check if the key is backspace
			if (event.key === "Backspace") {
				deleteLastLetter();
			} else if (
				//check if a letter is entered
				!isComputing &&
				isAlphabetic(event.key) &&
				currentActiveLetter < 5 &&
				event.key.length === 1
			) {
				const letter = event.key;
				fillInLetter(letter);
				// check if Row is completed
			} else if (
				!backgroundComputing &&
				event.key === "Enter" &&
				currentActiveLetter === 5 &&
				currentActiveWordRow < 6 &&
				isValidWord(wordRows[currentActiveWordRow])
			) {
				setCurrentActiveLetter(0);
				setCurrentActiveWordRow(currentActiveWordRow + 1);
			}
		}
	};

	/**
	 *
	 * SECTION FOR HOOKS
	 *
	 */
	useEffect(() => {
		if (currentActiveWordRow > 0) {
			updateCompletedRow();
		}
	}, [currentActiveWordRow]);

	useEffect(() => {
		document.addEventListener("keydown", keyDownHandler);

		//recieve result from worker
		myWorker.onmessage = (e) => {
			let newOptimalGuesses = [...optimalGuesses];
			newOptimalGuesses[e.data[1]] = e.data[0];
			setOptimalGuesses(newOptimalGuesses);
			console.log(newOptimalGuesses);
			setBackgroundComputing(false);
		};

		return function cleanup() {
			document.removeEventListener("keydown", keyDownHandler);
		};
	});

	useEffect(() => {
		if (workerStack.length > 0) {
			myWorker.postMessage(workerStack.pop());
			setBackgroundComputing(true);
		}
	}, [workerStack]);

	useEffect(() => {
		if (isComputing && optimalGuesses[currentActiveWordRow][0] !== "") {
			fillInWord(optimalGuesses[currentActiveWordRow][0]);
			setIsComputing(false);
		}
	}, [optimalGuesses, isComputing]);

	var rows = [];
	var skills = [];

	for (var i = 0; i < 6; i++) {
		rows.push(
			<WordRow
				key={i}
				wordRowValue={wordRows[i]}
				colorRowValue={colorRows[i]}
				animate={isComputing && i === currentActiveWordRow}
				skill={skillScores[i]}
			/>
		);
		skills.push(
			<div key={i} className="skills">
				{skillScores[i] > 0 ? "Skill: " + skillScores[i] : ""}
			</div>
		);
	}

	/**
	 * UTILITY FUNCTIONS
	 */
	function randomElementFromArray(array) {
		return array[Math.floor(Math.random() * array.length)];
	}

	return (
		<div className="center">
			<div className="grid-container">

				<div className="grid">{rows}</div>
			</div>
			<div className="buttons">
				{props.type === "helper" && (
					<Button
						className="my-5 justify-content-center btn-success"
						onClick={handleNextGuessClicked}
					>
						Click on me to reveal the best next guess!
					</Button>
				)}
				{props.type === "freeplay" && (
					<Button
						className="my-5 justify-content-center btn-danger"
						onClick={() => window.location.reload()}
					>
						Give me a different Word!
					</Button>
				)}
				{solved && (
					<Button
						className="my-5 justify-content-center btn-primary"
						onClick={handleShareClicked}
					>
						Share your grid!
					</Button>
				)}
				{syncWithWordle && (
					<div className="align-content-center">
						<iframe
							src="https://www.nytimes.com/games/wordle/index.html"
							height="400px"
							width="400px"
						/>
					</div>
				)}
				{backgroundComputing && <p>Computing, please wait</p>}
			</div>
		</div>
	);
}
export default Grid;
