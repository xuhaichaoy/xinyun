import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { MainMenuPage } from "@/pages/MainMenuPage";
import { LevelSelectPage } from "@/pages/LevelSelectPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { GamePage } from "@/pages/GamePage";
import { ResultsPage } from "@/pages/ResultsPage";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainMenuPage />} />
        <Route path="/levels" element={<LevelSelectPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
