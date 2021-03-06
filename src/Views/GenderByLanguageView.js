import React, { useState, useEffect } from "react";
import { Row, Col, Form, Tooltip } from "react-bootstrap";
import HoverTooltip from '../Components/HoverTooltip';
import GenderTable from "../Components/GenderTable";
import ScatterPlot from "../Components/ScatterPlot";
import ErrorDiv from '../Components/ErrorDiv'
import Licensing from '../Components/Licensing';
import {
  createColumns,
  filterMetrics,
  formatDate,
  loadingDiv,
  QIDs,
  keyFields,
  MultiValue,
  Option,
  ValueContainer,
  animatedComponents
} from "../utils";

import PopulationToggle from "../Components/PopulationToggler";
import SelectDropdown from '../Components/SelectDropdown'

function GenderByLanguageView({ API, snapshots }) {
  let makeProjectFilterFn = (selectedProjects) => (metric) => {
    // higher order function to predicate each indiv. metric
    const selectedProjectsValues = selectedProjects.map(
      (project) => project.value
    );
    return selectedProjectsValues.includes(metric.item.project);
  };
  const [allMetrics, setAllMetrics] = useState(null);
  const [allMeta, setAllMeta] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState(null);
  const [topProjects, setTopProjects] = useState(null);
  const [tableArr, setTableArr] = useState([]);
  const [tableMetaData, setTableMetaData] = useState({});
  const [tableColumns, setTableColumns] = useState([{}]);
  const [snapshot, setSnapshot] = useState("latest");
  const [snapshotDisplay, setSnapshotDisplay] = useState()
  const [isLoading, setIsLoading] = useState(true);
  const [isErrored, setIsErrored] = useState(false);

  function handleSnapshotChange(e) {
    let date = e.target.value;
    if (date.slice(11, 20) === "(latest)") {
      date = date.slice(0, 10);
    }
    setSnapshot(date.replace(/-+/g, ""));
    setTopProjects(null);
  }

  function createChartData(meta, metrics) {
    const tableArr = [];
    const extrema = {
      percentMax: Number.NEGATIVE_INFINITY,
      percentMin: Number.POSITIVE_INFINITY,
      totalMax: Number.NEGATIVE_INFINITY,
      totalMin: Number.POSITIVE_INFINITY,
    };
    metrics.forEach((obj, index) => {
      let tableObj = {};
      tableObj.key = index;
      tableObj.project = obj.item.project;
      tableObj.language = obj.item_label.project;
      tableObj.total = Object.values(obj.values).reduce((a, b) => a + b);
      tableObj.sumOtherGenders = 0;
      for (let genderId in meta.bias_labels) {
        let label = meta.bias_labels[genderId];
        tableObj[label] = obj["values"][genderId] ? obj["values"][genderId] : 0;
        tableObj[label + "Percent"] = obj["values"][genderId]
          ? (obj["values"][genderId] / tableObj["total"]) * 100
          : 0;
        if (genderId !== QIDs.male && genderId !== QIDs.female) {
          tableObj.sumOtherGenders += obj["values"][genderId]
            ? obj["values"][genderId]
            : 0;
        }
      }
      tableObj.sumOtherGendersPercent =
        (tableObj.sumOtherGenders / tableObj.total) * 100;
      tableArr.push(tableObj);

      let nonMalePercent = 100 - tableObj.malePercent;
      if (nonMalePercent > extrema.percentMax) {
        extrema.percentMax = nonMalePercent;
      } else if (nonMalePercent < extrema.percentMin) {
        extrema.percentMin = nonMalePercent;
      }

      if (tableObj.total > extrema.totalMax) {
        extrema.totalMax = tableObj.total;
      }
      if (tableObj.total < extrema.totalMin) {
        extrema.totalMin = tableObj.total;
      }
    });

    setTableMetaData(extrema);
    setTableArr(tableArr);
    if (!topProjects) {
      createTopProjects(tableArr);
    }
  }

  function createTopProjects(tableArr) {
    const numTopProjects = 25;
    const sortedTableArrByTotal = tableArr.sort((a, b) => b.total - a.total);
    const topTableArrByTotal = sortedTableArrByTotal.slice(0, numTopProjects);
    const topProjects = topTableArrByTotal.map((tao) => {
      return {
        label: tao.language,
        value: tao.project,
      };
    });
    setTopProjects(topProjects);
  }

  function filterAndCreateVizAndTable(meta, metrics) {
    // if there are selected projects use those, else use top projects
    // the default otherwise is to show all points
    let projectFilterFn = (metric) => true;
    if (selectedProjects) {
      projectFilterFn = makeProjectFilterFn(selectedProjects);
    } else if (topProjects) {
      projectFilterFn = makeProjectFilterFn(topProjects);
    }
    const filteredMetrics = filterMetrics(metrics, projectFilterFn);
    setTableColumns(createColumns(meta, filteredMetrics, "language"));
    createChartData(meta, filteredMetrics);
  }

  function createMultiselectData(metrics) {
    const multiSelectData = metrics.map((metric) => {
      return {
        label: metric.item_label.project,
        value: metric.item.project,
      };
    });
    return multiSelectData;
  }

  function processData(err, data) {
    if (err) {
      console.log("error is", err);
      setIsErrored(err);
    } else {
      setAllMetrics(data.metrics);
      setAllMeta(data.meta);
      setSnapshotDisplay(data.meta.snapshot)
      let multiSelectData = createMultiselectData(data.metrics);
      console.log("multiSelectData", multiSelectData);
      setAllProjects(multiSelectData);
      filterAndCreateVizAndTable(data.meta, data.metrics);
    }
    setIsLoading(false);
    return true;
  }

  // ReFetch useEffect changing snapshot view:
  useEffect(() => {
    // set topProjects to null so that it will rerender to create top 25
    // setTopProjects(null)
    API.get(
      {
        bias: "gender",
        metric: "gap",
        snapshot: snapshot,
        population: "gte_one_sitelink",
        property_obj: { project: "all", label_lang: "en" },
      },
      processData
    );
  }, [snapshot]);

  // ReFilter useEffect:
  useEffect(() => {
    if (allMeta && allMetrics) {
      filterAndCreateVizAndTable(allMeta, allMetrics);
    }
  }, [selectedProjects, topProjects]);

  function afterFilter(newResult, newFilters){
    console.log(newResult);
    console.log(newFilters);
  }

  const snapshotsDropdownOptions = snapshots ? (
    <div>
      <Form.Label>Snapshot (YYYY-DD-MM)</Form.Label>
      <Form.Control
        as="select"
        onChange={handleSnapshotChange}
        value={snapshot ? snapshot : "latest"}
      >
        {snapshots.map((snapshot, index) => (
          <option key={snapshot.id}>
            {index === 0
              ? formatDate(snapshot.date) + " (latest)"
              : formatDate(snapshot.date)}
          </option>
        ))} 
      </Form.Control>
    </div>
  ) : (
    <div> snapshots loading </div>
  );
  
  return (
    <div className="view-container language-view sub-container">
      <h4>Gender by language editions in Wikimedia Projects</h4>
      <PopulationToggle GTE_ONLY={true} />
      <div className="viz-description">
        <h5>
          Comparative view of gendered content in different Wikimedia Projects
        </h5>
        <p>
        This plot compares number of gendered content in different 
        Wikimedia projects to women/men/othergenders percentage of that content. 
        Comparisons of language editions and wikimedia project of your interest 
        can be made using filters 
        (top 25 wikimedia projects by number of humans are shown by default)
        </p>
      </div>
      <Row className="justify-content-md-center">
        <Col lg={7}>
          <div className="viz-heading">
            <p className="viz-timestamp">
              All time, as of {snapshotDisplay} 
            </p>
            <div>
              <HoverTooltip view={"language"} />
            </div>
          </div>
          <ScatterPlot
            data={tableArr}
            extrema={tableMetaData}
            columns={tableColumns}
          />
        </Col>
        <Col sm={3}>
          {snapshotsDropdownOptions}
          <SelectDropdown 
            options={allProjects}
            isMulti
            hideSelectedOptions={true}
            isClearable={true}
            components={{Option, MultiValue, ValueContainer, animatedComponents}}
            allowSelectAll={true}
            onChange={setSelectedProjects}
            placeholder={`Add data points from ${allProjects.length} wikimedia projects`}
            value={selectedProjects}
          />
        </Col>
      </Row>
      <Licensing />
      <Row className="justify-content-md-center">
        <div className="table-container">
          {isLoading ? loadingDiv : null}
          {isErrored ? <ErrorDiv errors={isErrored} /> : null}
          <GenderTable
            tableArr={tableArr}
            tableColumns={tableColumns}
            keyField={keyFields.language}
          />
        </div>
        <br />
        <br />
      </Row>
    </div>
  );
}

export default GenderByLanguageView;
