# backend/models/

Place these files here after running `notebooks/save_model.py` in Colab:

  fold_models.pkl          — list of 5 trained XGBClassifier objects
  feature_columns.json     — ordered list of column names after get_dummies
  metadata.json            — OOF AUC, feature info, raw column names
  sample_input.json        — one raw example row for testing

All .pkl files are git-ignored.
