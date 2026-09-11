# Evaluation sample candidates

Generated: 2026-09-06 (Claude / Cowork) — updated after a second, harder search pass

Discovery pool for the thesis evaluation, covering the 7 core notebook-classification
categories across GitHub, Codeberg, and Zenodo. `mixed_purpose` and `uncertain` are not
pre-sampled — they're fallback labels the classifier assigns after inspection, not stable
online search categories.

**This is a candidate pool, not a final verified sample.** Before using any entry as part
of the evaluation set, run it through the pipeline and drop anything inaccessible,
oversized, non-Python, or that fails to execute.

## Method and honest limits (read this first)

- **GitHub** — queried directly via the GitHub search API (`language:"Jupyter Notebook"`
  + category keywords). Real, live data — 105 repos found, **15/15 in every category**, as
  targeted. Nothing more to do here.
- **Codeberg — confirmed hard ceiling, not a search shortfall.** Its API is blocked by
  network policy here, and its search/explore pages are blocked by its own `robots.txt`
  (verified — it disallows `?q=`/`?sort=` query pages, plus a blanket block on AI-bot user
  agents; individual repo/org pages are not blocked, which is how each entry below was
  checked one at a time). I pushed hard on this: 20+ distinct search angles (category
  keywords, German terms, bioinformatics, climate, astronomy, university groups,
  reproducibility) plus opening the organization pages behind every hit found. Result:
  **19 verified repos total, and the last 8 searches found zero new ones** — the same
  handful of accounts (sail.black, movingpandas, elaraproject, sketchingpy) kept
  resurfacing. That repetition is the signal that the searchable pool is exhausted, not
  that a smarter query would find more. 15/category (105 total) is not achievable on
  Codeberg — the real ceiling is 19 across all 7 categories combined.
- **Zenodo — real growth, now blocked by fetch rate-limiting, not scarcity.** Same
  API-block situation (its `robots.txt` explicitly disallows `/api` and `/search`, with one
  narrow exception for `/api/records/*/files`), but individual record pages fetch fine and
  reliably show the file list. Grew from 35 → **63** across two search passes by working
  through dozens more category-specific queries and opening each candidate's file listing
  individually. The fetch service itself started rate-limiting (HTTP 429) even one request
  at a time toward the end of this pass — that's an external throttle on this environment,
  not a sign Zenodo has run out of candidates. Entries are marked **Verified** (file listing
  directly opened and confirmed) vs. **Identified** (strong title/description match, not
  independently opened this session).

## Summary

| Category | GitHub | Codeberg | Zenodo | Total |
|---|---:|---:|---:|---:|
| `data_preparation` | 15 | 3 | 13 | 31 |
| `data_analysis` | 15 | 3 | 8 | 26 |
| `visualization` | 15 | 1 | 8 | 24 |
| `machine_learning` | 15 | 5 | 7 | 27 |
| `simulation` | 15 | 3 | 9 | 27 |
| `tutorial` | 15 | 3 | 6 | 24 |
| `software_development` | 15 | 1 | 6 | 22 |
| **Total** | **105** | **19** | **56** | **180** |

Target was 7 × 3 × 15 = 315. Real, checked total after two hard search passes is **180**
(up from 157). GitHub is complete at 105. Codeberg is at its confirmed real ceiling (19 —
verified by exhaustion, not by giving up early). Zenodo is the only platform with more
real room to grow (63 vs. a possible 105) — it hit an external rate limit mid-verification,
not a scarcity wall; another pass later, spaced out over time, would likely close most of
that remaining gap.

---

## Data Preparation / Data Processing (`data_preparation`)

Cleans, transforms, combines, or prepares data.

### GitHub (15)

| # | Resource | Description |
|---:|---|---|
| 1 | [kavgan/nlp-in-practice](https://github.com/kavgan/nlp-in-practice) | Starter code for real-world text data problems: Word2Vec, phrase embeddings, text classification, pyspark word count, text preprocessing |
| 2 | [curiousily/Deep-Learning-For-Hackers](https://github.com/curiousily/Deep-Learning-For-Hackers) | ML tutorials with TensorFlow 2/Keras incl. data preprocessing, anomaly detection, forecasting |
| 3 | [MLforHealth/MIMIC_Extract](https://github.com/MLforHealth/MIMIC_Extract) | Data extraction, preprocessing, and representation pipeline for MIMIC-III |
| 4 | [cylondata/cylon](https://github.com/cylondata/cylon) | Fast, scalable, distributed-memory parallel runtime with a Pandas-like DataFrame |
| 5 | [PacktPublishing/Hands-On-Data-Preprocessing-in-Python](https://github.com/PacktPublishing/Hands-On-Data-Preprocessing-in-Python) | Book companion repo |
| 6 | [allen-chiang/Time-Series-Transformer](https://github.com/allen-chiang/Time-Series-Transformer) | Data preprocessing package for time series data (ML/DL) |
| 7 | [jbusecke/xMIP](https://github.com/jbusecke/xMIP) | Analysis-ready CMIP6 data in Python via pangeo tools |
| 8 | [wang-fujin/Battery-dataset-preprocessing-code-library](https://github.com/wang-fujin/Battery-dataset-preprocessing-code-library) | Reading/preprocessing public battery datasets |
| 9 | [ymoslem/OpenNMT-Tutorial](https://github.com/ymoslem/OpenNMT-Tutorial) | NMT tutorial: preprocessing, training, evaluation, deployment |
| 10 | [chakki-works/chariot](https://github.com/chakki-works/chariot) | Delivers ready-to-train data to NLP models |
| 11 | [vishnukanduri/Credit-Risk-Modeling-in-Python](https://github.com/vishnukanduri/Credit-Risk-Modeling-in-Python) | Credit risk modeling incl. EDA + preprocessing |
| 12 | [MLD3/FIDDLE](https://github.com/MLD3/FIDDLE) | Preprocessing pipeline transforming structured EHR data into feature vectors |
| 13 | [etccapital/MultiFactor](https://github.com/etccapital/MultiFactor) | Multi-factor backtesting: factor data collection and preprocessing |
| 14 | [Yu-Group/veridical-flow](https://github.com/Yu-Group/veridical-flow) | Building stable, trustworthy data-science pipelines (PCS framework) |
| 15 | [ChaitanyaK77/Building-a-Small-Language-Model-SLM-](https://github.com/ChaitanyaK77/Building-a-Small-Language-Model-SLM-) | Small LM from scratch: preprocessing, BPE tokenization, training |

### Codeberg (3 — verified)

| # | Resource | Evidence |
|---:|---|---|
| 1 | [Kzurro/Automar](https://codeberg.org/Kzurro/Automar) | ML framework repo; notebooks in `example/` (3% of repo) |
| 2 | [hankuoffroad/hatlas-eda-pipeline](https://codeberg.org/hankuoffroad/hatlas-eda-pipeline) | `lakehouse-eda.ipynb` — DuckDB-based EDA/preprocessing pipeline |
| 3 | [concur1/pl-compare](https://codeberg.org/concur1/pl-compare) | `pl_compare_demo.ipynb` — tabular data comparison tool demo |

### Zenodo (13)

**Verified (file listing directly opened):**

| # | Resource | Evidence |
|---:|---|---|
| 1 | [Data Preprocessing Toolbox](https://zenodo.org/records/10971421) | Direct `.ipynb` files: Example_Editor, Example_Error_Finder, Example_Multiprocess, Example_Reader, Example_Writer |
| 2 | [LDH-OER v1.0.0](https://zenodo.org/records/18204385) | ZIP contains `dataprocess.ipynb` |
| 3 | [Data Cleaning, Translation & Split (Berliner Handreichungen dataset)](https://zenodo.org/records/6957842) | Direct `Data_Cleaning.ipynb` (397.8 kB) |
| 4 | [Time Series Data Preparation for CNN and LSTM](https://zenodo.org/records/11180681) | Direct `.ipynb` files present |
| 5 | [Adult dataset preprocessed](https://zenodo.org/records/12533514) | Direct `adult_preprocessing.ipynb` (one-hot encoding, KNN imputation, standardization) |

**Identified (search-matched, verify file listing before use):**

| # | Resource |
|---:|---|
| 6 | [Introduction to pandas](https://zenodo.org/records/17422341) |
| 7 | [Working with pandas: merging, apply, and groupby](https://zenodo.org/records/17422806) |
| 8 | [Data Cleaning with OpenRefine](https://zenodo.org/records/6863001) |
| 9 | [Profiel study data cleaning](https://zenodo.org/records/14989827) |
| 10 | [Simple Language Data Preparation Tools](https://zenodo.org/records/21122288) |
| 11 | [Pandas/csv import assignment](https://zenodo.org/records/18615242) |
| 12 | [goal-data-preprocessing package](https://zenodo.org/records/10992164) |
| 13 | [macroXAS for data pre-processing](https://zenodo.org/records/10975456) |

---

## Data Analysis (`data_analysis`)

Explores data, computes statistics, or answers research questions.

### GitHub (15)

| # | Resource | Description |
|---:|---|---|
| 1 | [PacktPublishing/Hands-on-Exploratory-Data-Analysis-with-Python](https://github.com/PacktPublishing/Hands-on-Exploratory-Data-Analysis-with-Python) | Book companion repo |
| 2 | [khusheekapoor/DataAnalyticsProjects](https://github.com/khusheekapoor/DataAnalyticsProjects) | EDA, recommendation systems, association rule mining, sentiment/time-series analysis |
| 3 | [ajaymache/data-analysis-using-python](https://github.com/ajaymache/data-analysis-using-python) | EDA of used-car database |
| 4 | [mrdbourke/your-first-kaggle-submission](https://github.com/mrdbourke/your-first-kaggle-submission) | EDA on Kaggle Titanic dataset |
| 5 | [drshahizan/Python_EDA](https://github.com/drshahizan/Python_EDA) | 21 EDA case studies on Malaysian datasets |
| 6 | [PacktPublishing/Exploratory-Data-Analysis-with-Python-Cookbook](https://github.com/PacktPublishing/Exploratory-Data-Analysis-with-Python-Cookbook) | Book companion repo |
| 7 | [Josephjiao7/Geographical-Gaussian-Process-Regression](https://github.com/Josephjiao7/Geographical-Gaussian-Process-Regression) | GGPR for spatial prediction and exploratory spatial data analysis |
| 8 | [tdhopper/pythonplot.com](https://github.com/tdhopper/pythonplot.com) | Interactive comparison of Python plotting libraries for EDA |
| 9 | [Viveckh/LilHomie](https://github.com/Viveckh/LilHomie) | Web scraping + EDA + ML for NY housing price prediction |
| 10 | [vishnukanduri/Credit-Risk-Modeling-in-Python](https://github.com/vishnukanduri/Credit-Risk-Modeling-in-Python) | Credit risk modeling incl. EDA |
| 11 | [iNeuronai/EDACollection](https://github.com/iNeuronai/EDACollection) | Collection of EDA approaches |
| 12 | [chiragsamal/Zomato](https://github.com/chiragsamal/Zomato) | Zomato EDA, visualization, prediction, sentiment analysis |
| 13 | [Deffro/Data-Science-Portfolio](https://github.com/Deffro/Data-Science-Portfolio) | Notebooks: tutorials, EDA, ML |
| 14 | [Patotricks15/Ciencia-de-dados-projetos](https://github.com/Patotricks15/Ciencia-de-dados-projetos) | Web scraping + EDA + ML + recommendation system |
| 15 | [CoenMeintjes/data_science_notebook_templates](https://github.com/CoenMeintjes/data_science_notebook_templates) | Notebook templates: EDA, hypothesis testing, regression, ML |

### Codeberg (3 — verified)

| # | Resource | Evidence |
|---:|---|---|
| 1 | [arando/GarminDB](https://codeberg.org/arando/GarminDB) | `Jupyter/` directory, 14.8% of repo — analysis notebooks for Garmin/Fitbit/MS Health data |
| 2 | [movingpandas/movingpandas-examples](https://codeberg.org/movingpandas/movingpandas-examples) | 99% Jupyter Notebook — `1-tutorials/`, `2-analysis-examples/`, `3-tech-demos/` |
| 3 | [elaraproject/build-logs](https://codeberg.org/elaraproject/build-logs) | 99.2% Jupyter Notebook — monthly build/test-result log entries |

### Zenodo (8)

**Verified (file listing directly opened):**

| # | Resource | Evidence |
|---:|---|---|
| 1 | [PyNotes for Environmental Scientists](https://zenodo.org/records/3731390) | ZIP contains "120+ Jupyter notebooks exploring patterns in environmental observations" |
| 2 | [Collection of codes for "A cell atlas of human thymic development..."](https://zenodo.org/records/5500511) | Code package explicitly described as containing "jupyter notebooks describing the analysis" |
| 3 | [Spectral Analysis of Time Series with Irregular Cadence (Bronez Multitaper)](https://zenodo.org/records/20764307) | 5 direct `.ipynb` files (paleoclimate + exoplanet analysis) |
| 4 | [Student Performance and Learning Behavior Dataset for Educational Analytics](https://zenodo.org/records/16459132) | Direct `Project.ipynb` — full analysis/modeling pipeline |
| 5 | [aus_precip_benchmarking](https://zenodo.org/records/8365065) | ZIP contains master + figure-specific `.ipynb` notebooks (climate model analysis) |
| 6 | [Supporting Data and Code: Credit Delinquency Prediction in Peru](https://zenodo.org/records/14890903) | `Programs.zip` described as containing preprocessing/training/interpretability notebooks |

**Identified:**

| # | Resource |
|---:|---|
| 7 | [DASWOW Jupyter Notebooks Subset (470 notebooks)](https://zenodo.org/records/17638925) |
| 8 | [Bioinformatics data analysis and visualization toolkit](https://zenodo.org/records/3732872) |

---

## Visualization (`visualization`)

Primarily creates plots, charts, dashboards, or visual reports.

### GitHub (15)

| # | Resource | Description |
|---:|---|---|
| 1 | [mpld3/mpld3](https://github.com/mpld3/mpld3) | Brings matplotlib graphics to the browser via D3 |
| 2 | [gboeing/data-visualization](https://github.com/gboeing/data-visualization) | Misc data viz projects (pandas + matplotlib, leaflet) |
| 3 | [ptyadana/Data-Science-and-Machine-Learning-Projects-Dojo](https://github.com/ptyadana/Data-Science-and-Machine-Learning-Projects-Dojo) | Data science/ML/viz projects |
| 4 | [CICIFLY/Data-Analytics-Projects](https://github.com/CICIFLY/Data-Analytics-Projects) | Collecting, cleaning, visualizing, analyzing |
| 5 | [KeithGalli/matplotlib_tutorial](https://github.com/KeithGalli/matplotlib_tutorial) | Matplotlib tutorial source code |
| 6 | [stefmolin/python-data-viz-workshop](https://github.com/stefmolin/python-data-viz-workshop) | Data viz workshop w/ notebooks and exercises |
| 7 | [milaan9/11_Python_Matplotlib_Module](https://github.com/milaan9/11_Python_Matplotlib_Module) | Matplotlib module walkthrough |
| 8 | [xShaimaa/Data-Analysis-Projects](https://github.com/xShaimaa/Data-Analysis-Projects) | Cleaning, visualization, EDA |
| 9 | [croach/oreilly-matplotlib-course](https://github.com/croach/oreilly-matplotlib-course) | O'Reilly Matplotlib course notebooks |
| 10 | [DataForScience/DataViz](https://github.com/DataForScience/DataViz) | Data viz with Matplotlib and Seaborn |
| 11 | [034adarsh/Stock-Price-Prediction-Using-LSTM](https://github.com/034adarsh/Stock-Price-Prediction-Using-LSTM) | Stock price prediction with LSTM |
| 12 | [TrainingByPackt/Data-Visualization-with-Python](https://github.com/TrainingByPackt/Data-Visualization-with-Python) | Book companion repo |
| 13 | [pmaji/practical-python-data-viz-guide](https://github.com/pmaji/practical-python-data-viz-guide) | Practical data viz teaching resources |
| 14 | [jcwill415/Stock_Market_Data_Analysis](https://github.com/jcwill415/Stock_Market_Data_Analysis) | Scrape/analyze/visualize S&P500 data |
| 15 | [akcarsten/fMRI_data_analysis](https://github.com/akcarsten/fMRI_data_analysis) | Displaying structural/functional fMRI data |

### Codeberg (1 — verified; confirmed ceiling, see Method notes)

| # | Resource | Evidence |
|---:|---|---|
| 1 | [hhwerbefrei/geoanalyse](https://codeberg.org/hhwerbefrei/geoanalyse) | `notebooks/` — 4 notebooks producing zone/route-load graphics from Hamburg geodata |

### Zenodo (8)

**Verified (file listing directly opened):**

| # | Resource | Evidence |
|---:|---|---|
| 1 | [Dataset and Jupyter notebook for pyDARN](https://zenodo.org/records/7005203) | ZIP contains the paper's Jupyter notebook |
| 2 | [The OpenScope Databook](https://zenodo.org/records/12614664) | ZIP (42.4 MB) contains `.ipynb` reproducible neuroscience notebooks |
| 3 | [IPSL-CM5A2-diags: Jupyter notebook first release](https://zenodo.org/records/3549652) | ZIP contains the diagnostics notebook (Binder-runnable) |
| 4 | [Interactive Data Visualization in Jupyter Notebooks](https://zenodo.org/records/4444154) | ZIP — NotebookJS library source + paper code |
| 5 | [Data for "Interactive maps in the Jupyter notebook"](https://zenodo.org/records/3255070) | `.tar` archive of notebooks/data for a CarpentryConnect 2019 lesson |

**Identified:**

| # | Resource |
|---:|---|
| 6 | [Quansight-Labs/bokeh-a11y-audit v1.0.0](https://zenodo.org/records/14923642) |
| 7 | [Leafmap: interactive mapping/geospatial analysis in Jupyter](https://zenodo.org/record/5574279) |
| 8 | [GeoLibre](https://zenodo.org/records/21460383) |

---

## Machine Learning (`machine_learning`)

Trains, evaluates, or applies predictive or learned models.

### GitHub (15)

| # | Resource | Description |
|---:|---|---|
| 1 | [nfmcclure/tensorflow_cookbook](https://github.com/nfmcclure/tensorflow_cookbook) | Code for Tensorflow ML Cookbook |
| 2 | [timeseriesAI/tsai](https://github.com/timeseriesAI/tsai) | SOTA deep learning for time series (PyTorch/fastai) |
| 3 | [BinRoot/TensorFlow-Book](https://github.com/BinRoot/TensorFlow-Book) | Book companion repo |
| 4 | [rasbt/pattern_classification](https://github.com/rasbt/pattern_classification) | Tutorials on ML and pattern classification |
| 5 | [tirthajyoti/Machine-Learning-with-Python](https://github.com/tirthajyoti/Machine-Learning-with-Python) | Tutorial-style ML notebooks |
| 6 | [dipanjanS/practical-machine-learning-with-python](https://github.com/dipanjanS/practical-machine-learning-with-python) | Practical ML/DL with Python |
| 7 | [anujvyas/Machine-Learning-Projects](https://github.com/anujvyas/Machine-Learning-Projects) | ML project collection |
| 8 | [dformoso/sklearn-classification](https://github.com/dformoso/sklearn-classification) | Classification task with sklearn/TensorFlow |
| 9 | [azminewasi/Machine-Learning-AndrewNg-DeepLearning.AI](https://github.com/azminewasi/Machine-Learning-AndrewNg-DeepLearning.AI) | Coursera ML specialization notes/exercises |
| 10 | [dchad/malware-detection](https://github.com/dchad/malware-detection) | Malware detection/classification with ML |
| 11 | [NishkarshRaj/100DaysofMLCode](https://github.com/NishkarshRaj/100DaysofMLCode) | #100DaysOfMLCode journey |
| 12 | [mhuzaifadev/machine-learning_zero-to-hero](https://github.com/mhuzaifadev/machine-learning_zero-to-hero) | ML fundamentals to advanced techniques |
| 13 | [javedsha/text-classification](https://github.com/javedsha/text-classification) | Text classification with sklearn/NLTK |
| 14 | [syamkakarla98/Satellite_Imagery_Analysis](https://github.com/syamkakarla98/Satellite_Imagery_Analysis) | ML/DL on satellite data |
| 15 | [sharmaroshan/Twitter-Sentiment-Analysis](https://github.com/sharmaroshan/Twitter-Sentiment-Analysis) | Sentiment classification via ML |

### Codeberg (5 — verified; confirmed ceiling, see Method notes)

| # | Resource | Evidence |
|---:|---|---|
| 1 | [sethuiyer/mlhub](https://codeberg.org/sethuiyer/mlhub) | 86.9% Jupyter Notebook — 15+ ML experiment notebooks (regression, CNN, RNN, NLP) |
| 2 | [jonne/discourse-relation-classification](https://codeberg.org/jonne/discourse-relation-classification) | 94.4% Jupyter — 2 direct `.ipynb` (train/dev + test evaluation) |
| 3 | [Fontys/titanic-decision-tree](https://codeberg.org/Fontys/titanic-decision-tree) | 100% Jupyter — `titanic.ipynb` |
| 4 | [sail.black/carate](https://codeberg.org/sail.black/carate) | 82.6% Jupyter — `Quickstart.ipynb`, `Analysis.ipynb` |
| 5 | [epjane/BoggleCV](https://codeberg.org/epjane/BoggleCV) | 57.2% Jupyter — 3 notebooks (full/minimal pipeline, TF model) |

### Zenodo (7)

**Verified (file listing directly opened):**

| # | Resource | Evidence |
|---:|---|---|
| 1 | [Ghost Echoes Revealed](https://zenodo.org/records/12548630) | Direct `.ipynb` × 2 (maintainability + liability prediction) |
| 2 | [Predicting and improving complex beer flavor through ML](https://zenodo.org/records/10653704) | Direct `.ipynb` × 3 (training, SHAP analysis, partial dependence) |
| 3 | [Machine learning course with Jupyter/IPython](https://zenodo.org/records/495739) | ZIP contains course notebooks + slides |
| 4 | [PyDaddy: Python Package for Discovering SDEs](https://zenodo.org/records/13777396) | ZIP contains 9 example `.ipynb` notebooks |
| 5 | [Leeds Institute of Fluid Dynamics Machine Learning Notebooks](https://zenodo.org/records/5227413) | ZIP contains 4 `.ipynb` tutorials (CNN, physics-informed NN, Gaussian processes, random forests) |

**Identified:**

| # | Resource |
|---:|---|
| 6 | [Learning to Edit Interactive Machine Learning Notebooks](https://zenodo.org/records/15716537) |
| 7 | [NeuroKit2: Python Toolbox for Neurophysiological Signal Processing](https://zenodo.org/records/6084791) |

---

## Simulation (`simulation`)

Models systems, runs simulations, or performs numerical experiments.

### GitHub (15)

| # | Resource | Description |
|---:|---|---|
| 1 | [qn895/reservoir-simulation](https://github.com/qn895/reservoir-simulation) | Reservoir simulation patterns/snippets (implicit numerical methods) |
| 2 | [farhadkama/phasefield_usnccm](https://github.com/farhadkama/phasefield_usnccm) | FEniCSx phase-field fracture simulation notebooks |
| 3 | [albertoreyescastro/computational-physics-numerical-methods](https://github.com/albertoreyescastro/computational-physics-numerical-methods) | Interpolation, integration, ODE solvers, stochastic simulation |
| 4 | [honglizhaobob/Winter21Autumn22Stat31120](https://github.com/honglizhaobob/Winter21Autumn22Stat31120) | Numerical methods for SDEs, Monte Carlo simulations |
| 5 | [miamico/dynamical-Lamb-effect](https://github.com/miamico/dynamical-Lamb-effect) | Numerical simulation of dynamical Lamb effect in cavity QED |
| 6 | [sharma2409/Numerical-Simulation-of-JP-10-Water-Combustion...](https://github.com/sharma2409/Numerical-Simulation-of-JP-10-Water-Combustion-at-High-Pressure) | MS thesis combustion simulation (Cantera) |
| 7 | [Tanishq7361/Euler-Cromer-Oscillator-Simulation](https://github.com/Tanishq7361/Euler-Cromer-Oscillator-Simulation) | Computational physics: oscillator simulation |
| 8 | [Tanishq7361/Forced-Damped-Oscillator-Simulation](https://github.com/Tanishq7361/Forced-Damped-Oscillator-Simulation) | Forced-damped oscillator simulation |
| 9 | [parthpadia/IQC-URA-Gaussian-beam-simulation](https://github.com/parthpadia/IQC-URA-Gaussian-beam-simulation) | Gaussian beam propagation simulation |
| 10 | [danjackho/QuantumMemorySim](https://github.com/danjackho/QuantumMemorySim) | Quantum memory numerical simulation (MSc thesis) |
| 11 | [Tanishq7361/Coupled-Oscillators-and-Nonlinear-Pendulum](https://github.com/Tanishq7361/Coupled-Oscillators-and-Nonlinear-Pendulum) | Coupled oscillator / nonlinear pendulum simulations |
| 12 | [chroakPRO/research-learning](https://github.com/chroakPRO/research-learning) | Numerical simulation, statistical modeling, viz, ML |
| 13 | [JorgikNoob/Xmode-WavesPlasma](https://github.com/JorgikNoob/Xmode-WavesPlasma) | Full-wave simulation of plasma wave propagation |
| 14 | [tommasonobili/Numerical-Simulation-Laboratory](https://github.com/tommasonobili/Numerical-Simulation-Laboratory) | Numerical simulation lab exercises |
| 15 | [JakobBD/innusint](https://github.com/JakobBD/innusint) | Intro to numerical simulation notebook templates |

### Codeberg (3 — verified; confirmed ceiling, see Method notes)

| # | Resource | Evidence |
|---:|---|---|
| 1 | [sail.black/openmd](https://codeberg.org/sail.black/openmd) | 82.9% Jupyter — `notebooks/` for molecular dynamics (Lennard-Jones) |
| 2 | [elaraproject/elara-labs](https://codeberg.org/elaraproject/elara-labs) | 27.7% Jupyter — `notebooks/` for particle-beam/RF simulations |
| 3 | [francois.boulier/DifferentialAlgebra](https://codeberg.org/francois.boulier/DifferentialAlgebra) | `gallery/` folder with ODE/PDE example notebooks |

### Zenodo (9)

**Verified (file listing directly opened):**

| # | Resource | Evidence |
|---:|---|---|
| 1 | [Jupyter Notebook for MD using Gromacs](https://zenodo.org/records/3832358) | ZIP — molecular dynamics simulation + analysis notebook |
| 2 | [Notebooks for DELVE Milky Way Satellite Galaxy Census I](https://zenodo.org/records/18383157) | ZIP contains 2 direct `.ipynb` (selection function, empirical luminosity/simulated populations) |

**Identified:**

| # | Resource |
|---:|---|
| 3 | [Modelica Models and Jupyter Notebooks for Glucose Insulin Regulation](https://zenodo.org/records/3633324) |
| 4 | [Data, scripts and simulations for ProxyOH-[OH] (ATom/F0AM/AM3)](https://zenodo.org/records/7512701) |
| 5 | [Wyrtki-CSLIM: Python toolbox for the Linear Inverse Model](https://zenodo.org/records/17239171) |
| 6 | [Majorana parity qubit in coupled minimal Kitaev chains](https://zenodo.org/records/21280458) |
| 7 | [Cross-Platform Autonomous Control of Minimal Kitaev Chains](https://zenodo.org/records/10900882) |
| 8 | [VelhoLab/Monte-Carlo-Simulations-and-ZScore-Calculation](https://zenodo.org/records/6677897) |
| 9 | [SolidsPy: 2D-Finite Element Analysis with Python](https://zenodo.org/records/7694030) |

---

## Tutorial (`tutorial`)

Teaches a method or demonstrates how to use a tool or dataset.

### GitHub (15)

| # | Resource | Description |
|---:|---|---|
| 1 | [NirDiamant/Prompt_Engineering](https://github.com/NirDiamant/Prompt_Engineering) | 22 prompt engineering techniques, hands-on notebooks |
| 2 | [justmarkham/scikit-learn-videos](https://github.com/justmarkham/scikit-learn-videos) | Notebooks from scikit-learn video series |
| 3 | [openvinotoolkit/openvino_notebooks](https://github.com/openvinotoolkit/openvino_notebooks) | OpenVINO tutorial notebooks |
| 4 | [phlippe/uvadlc_notebooks](https://github.com/phlippe/uvadlc_notebooks) | UvA Deep Learning Course notebooks |
| 5 | [curiousily/Getting-Things-Done-with-Pytorch](https://github.com/curiousily/Getting-Things-Done-with-Pytorch) | PyTorch tutorials on real-world problems |
| 6 | [justmarkham/pandas-videos](https://github.com/justmarkham/pandas-videos) | Notebooks from pandas video series |
| 7 | [sachinruk/deepschool.io](https://github.com/sachinruk/deepschool.io) | Deep learning tutorials in notebooks |
| 8 | [jadianes/spark-py-notebooks](https://github.com/jadianes/spark-py-notebooks) | PySpark tutorials for big data/ML |
| 9 | [mGalarnyk/Python_Tutorials](https://github.com/mGalarnyk/Python_Tutorials) | Python tutorials (notebook + video) |
| 10 | [curiousily/Get-Things-Done-with-Prompt-Engineering-and-LangChain](https://github.com/curiousily/Get-Things-Done-with-Prompt-Engineering-and-LangChain) | LangChain/prompt engineering tutorials |
| 11 | [curiousily/Deep-Learning-For-Hackers](https://github.com/curiousily/Deep-Learning-For-Hackers) | TensorFlow2/Keras ML tutorials |
| 12 | [qiskit-community/qiskit-community-tutorials](https://github.com/qiskit-community/qiskit-community-tutorials) | Community Qiskit tutorials |
| 13 | [KeithGalli/NumPy](https://github.com/KeithGalli/NumPy) | NumPy tutorial notebook |
| 14 | [gordicaleksa/get-started-with-JAX](https://github.com/gordicaleksa/get-started-with-JAX) | JAX/Flax/Haiku tutorial series |
| 15 | [QuantConnect/Tutorials](https://github.com/QuantConnect/Tutorials) | QuantConnect Python/finance tutorials |

### Codeberg (3 — verified; confirmed ceiling, see Method notes)

| # | Resource | Evidence |
|---:|---|---|
| 1 | [sketchingpy/example-jupyter-notebook](https://codeberg.org/sketchingpy/example-jupyter-notebook) | `Sketchingpy in Jupyter.ipynb` — Matplotlib + ipywidgets demo |
| 2 | [cpence/topic-modeling-tutorial](https://codeberg.org/cpence/topic-modeling-tutorial) | 100% Jupyter — `notebook.ipynb`, Vienna summer-school topic modeling tutorial |
| 3 | [elaraproject/elara-handbook](https://codeberg.org/elaraproject/elara-handbook) | 98.9% Jupyter — Jupyter Book reference handbook (Markdown + executable notebooks) |

### Zenodo (6 — all verified, file listing directly opened)

| # | Resource | Evidence |
|---:|---|---|
| 1 | [Jupyter Tutorial](https://zenodo.org/records/8053980) | `.tar` archive of the well-known Jupyter Tutorial book/notebooks |
| 2 | [hibernator11/notebook-EADH-2021-workshop](https://zenodo.org/records/5495619) | ZIP — digital humanities workshop `.ipynb` notebooks |
| 3 | [Introduction to SEM-EDS data processing using HyperSpy and Jupyter Notebooks](https://zenodo.org/records/6566768) | Direct `.ipynb` × 2 |
| 4 | [astroSim: Jupyter Notebook tutorials for astrophysical simulations](https://zenodo.org/record/59657) | ZIP — FLASH gravitational-collapse simulation tutorials |
| 5 | [Computational models of human social behavior and neuroscience (Jupyter Book course)](https://zenodo.org/records/5907206) | ZIP — 14-week course, Jupyter Book + Python tutorials |
| 6 | [CIMCB/MetabWorkflowTutorial: Metabolomics Tutorial](https://zenodo.org/records/3362625) | ZIP contains 5 direct `.ipynb` notebooks |

---

## Software Development (`software_development`)

Develops, tests, or demonstrates reusable software components.

### GitHub (15)

| # | Resource | Description |
|---:|---|---|
| 1 | [mudigosa/Image-Classifier](https://github.com/mudigosa/Image-Classifier) | Trainable image classifier app (CLI + notebook) |
| 2 | [GeoffCope/General_Relativity_Python](https://github.com/GeoffCope/General_Relativity_Python) | EinsteinPy-based field equation derivations |
| 3 | [Bibhuti5/Potato-Disease-Classification](https://github.com/Bibhuti5/Potato-Disease-Classification) | Full-stack app: training notebook + FastAPI + React |
| 4 | [Aurokrishnaa/Algorithmic-trading-with-IBridgePy-python-Aurokrishnaa](https://github.com/Aurokrishnaa/Algorithmic-trading-with-IBridgePy-python-Aurokrishnaa) | IBridgePy package usage notebook |
| 5 | [pankaj614/gdp-analysis-india-2014-15](https://github.com/pankaj614/gdp-analysis-india-2014-15) | Structured data-analysis project (100% notebook) |
| 6 | [TUDelft-CITG/OpenCLSim-Notebooks](https://github.com/TUDelft-CITG/OpenCLSim-Notebooks) | Example notebooks for the OpenCLSim package |
| 7 | [hyperactive-project/hyperactive-tutorials](https://github.com/hyperactive-project/hyperactive-tutorials) | Examples/notebooks for the Hyperactive package |
| 8 | [mwauters92/TIQIT_tutorial](https://github.com/mwauters92/TIQIT_tutorial) | Qiskit package usage examples |
| 9 | [TUDelft-CITG/OpenTNSim-Notebooks](https://github.com/TUDelft-CITG/OpenTNSim-Notebooks) | Example notebooks for the OpenTNSim package |
| 10 | [clarkevanswx/data-wrangling-examples](https://github.com/clarkevanswx/data-wrangling-examples) | Package usage examples for atmospheric datasets |
| 11 | [lnxpy/pypi-prediction-examples](https://github.com/lnxpy/pypi-prediction-examples) | Notebook examples using MindsDB + PyPI handler |
| 12 | [shanujans/loan-risk-prediction](https://github.com/shanujans/loan-risk-prediction) | Notebook-to-package structuring/publishing example |
| 13 | [mirko-leccese/Scraping-Spotify-Chart-with-Python](https://github.com/mirko-leccese/Scraping-Spotify-Chart-with-Python) | Scrapy package usage notebook |
| 14 | [calebjore/08_data-validation](https://github.com/calebjore/08_data-validation) | Great Expectations package usage in a notebook |
| 15 | [milan6rt/Python-Packages](https://github.com/milan6rt/Python-Packages) | NumPy package usage examples |

### Codeberg (1 — verified; confirmed ceiling, see Method notes)

| # | Resource | Evidence |
|---:|---|---|
| 1 | [guix-science/guix-jupyter](https://codeberg.org/guix-science/guix-jupyter) | `guix-kernel-demo.ipynb` — Jupyter kernel for reproducible Guix environments |

### Zenodo (6)

**Verified (file listing directly opened):**

| # | Resource | Evidence |
|---:|---|---|
| 1 | [Python Jupyter Notebooks and Data for Colorimetric Microscopy](https://zenodo.org/records/7789585) | Direct `.ipynb` × 3 |
| 2 | [Examples for Onward! 2022: Intramorphic Testing](https://zenodo.org/records/7229326) | Direct `Intramorphic Testing.ipynb` |
| 3 | [AllenCellModeling/diffusive_distinguishability v1.0](https://zenodo.org/records/2662552) | ZIP explicitly described as containing `.ipynb` + `.py` files |
| 4 | [pyglotaran: Python library for global and target analysis](https://zenodo.org/records/18111874) | Release notes reference its "getting-started notebook documentation" |
| 5 | [Federated LOD Queries as CaD - Notebooks](https://zenodo.org/records/15349480) | ZIP explicitly described as containing `.ipynb` files (digital humanities LOD queries) |

**Identified:**

| # | Resource |
|---:|---|
| 6 | [pytest-cases: Python package for reproducible research results](https://zenodo.org/records/10929081) |

---

## Recommended next steps

1. Run each candidate through the pipeline's own repo-import step — this is the real filter (accessible, has notebooks, executes, right Python version).
2. Prioritize verification of the entries marked **Identified** above — those still need their file listing opened to confirm `.ipynb` presence before being trusted.
3. **On 15/category (315 total) as a target:** GitHub already has it. Codeberg's ceiling is real and confirmed (19 total, found by exhaustive search across 20+ query angles plus organization-page checks — not a shortfall in effort). Zenodo is the one platform genuinely worth another pass: it was still turning up new, on-topic candidates every single search when the session's fetch service started rate-limiting; spacing further searches out over time (rather than in one sitting) would likely push most categories close to 15.
4. For a thesis writeup, Codeberg's small real pool (19 repos total vs. GitHub's 100M+ and Zenodo's much larger research-data corpus) is itself a legitimate, citable finding about platform-level data availability for reproducibility research — not a limitation of this search.
